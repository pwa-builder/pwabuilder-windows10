var fs = require('fs'),
    os = require('os'),
    path = require('path'),
    url = require('url');

var archiver = require('archiver'),
    cloudappx = require('cloudappx-server'),
    Q = require('q'),
    request = require('request');

var pwabuilderLib = require('pwabuilder-lib');

var CustomError = pwabuilderLib.CustomError,
    log = pwabuilderLib.log;

var serviceEndpoint = 'http://cloudappx.azurewebsites.net';
var publishEndpoint = 'http://autopublish-api-prod.azurewebsites.net';

// Quick sanity check to ensure that the placeholder parameters in the manifest
// have been replaced by the user with their publisher details before generating
// a package.
function validateManifestPublisherDetails(appFolder, shouldSign, callback) {
  console.log('appFolder', appFolder);
  var manifestPath = path.join(appFolder, 'appxmanifest.xml');
  return Q.nfcall(fs.readFile, manifestPath, 'utf8').then(function (data) {
    if (shouldSign) {
      return;
    }

    var packageIdentityPlaceholders = /<Identity.*(Name\s*=\s*"INSERT-YOUR-PACKAGE-IDENTITY-NAME-HERE"|Publisher\s*=\s*"CN=INSERT-YOUR-PACKAGE-IDENTITY-PUBLISHER-HERE")/g;
    var publisherDisplayNamePlaceholder = /<PublisherDisplayName>\s*INSERT-YOUR-PACKAGE-PROPERTIES-PUBLISHERDISPLAYNAME-HERE\s*<\/PublisherDisplayName>/g;
    if (packageIdentityPlaceholders.test(data) || publisherDisplayNamePlaceholder.test(data)) {
      return Q.reject(new Error('The application manifest is incomplete. Register the app in the Windows Store to obtain the Package/Identity/Name, \nPackage/Identity/Publisher, and Package/Properties/PublisherDisplayName details. \nThen, use this information to update the corresponding placeholders in the appxmanifest.xml file before \ncreating the App Store package.'));
    }
  })
  .catch(function (err) {
    return Q.reject(new CustomError('The specified path does not contain a valid app manifest file.', err));
  })
  .nodeify(callback);
}

function invokeCloudAppX(name, appFolder, outputFilePath, operation, callback) {
  var deferred = Q.defer();
  var archive = archiver('zip');
  var zipFile = path.join(os.tmpdir(), name + '.zip');
  var output = fs.createWriteStream(zipFile);
  var endPointValue = '/v3/' + operation;

  archive.on('error', function (err) {
    deferred.reject(err);
  });

  archive.pipe(output);

  archive.directory(appFolder, name);
  archive.finalize();

  var operationUrl = url.resolve(process.env.CLOUDAPPX_SERVICE_ENDPOINT || serviceEndpoint, endPointValue);
  output.on('close', function () {
    var options = {
      method: 'POST',
      url: operationUrl,
      encoding: 'binary'
    };

    log.debug('Invoking the CloudAppX service...');

    var req = request.post(options, function (err, resp, body) {
      if (err) {
        return deferred.reject(err);
      }

      if (resp.statusCode !== 200) {
        return deferred.reject(new Error('Failed to create the package. The CloudAppX service returned an error - ' + resp.statusMessage + ' (' + resp.statusCode + '): ' + body));
      }

      fs.writeFile(outputFilePath, body, { 'encoding': 'binary' }, function (err) {
        if (err) {
          return deferred.reject(err);
        }

        fs.unlink(zipFile, function (err) {
          if (err) {
            return deferred.reject(err);
          }

          return deferred.resolve();
        });
      });
    });

    req.form().append('xml', fs.createReadStream(zipFile));
  });

  return deferred.promise.nodeify(callback);
}

function invokeAutoPublish(platformDir, name, email, appName, callback) {
  var deferred = Q.defer();
  var archive = archiver('zip');
  var zipFileName =  appName + '.zip'
  var zipFilePath = path.join(os.tmpdir(), zipFileName);
  var output = fs.createWriteStream(zipFilePath);

  log.debug('Created zip file ' + zipFilePath);

  archive.on('error', function (err) {
    deferred.reject(err);
  });

  archive.pipe(output);

  archive.glob('**/*.*', { cwd: platformDir });
  archive.finalize();

  output.on('close', function() {
    var formData = {
      name : name,
      email : email,
      appName: appName,
      fileName: zipFileName,
      webPackage : fs.createReadStream(zipFilePath)
    };

    request.post({
        url: url.resolve(publishEndpoint, "/api/autopublish"),
        formData: formData,
      },
      function (err, resp, body) {
        if (err) {
          return deferred.reject(err);
        }

        if (resp.statusCode !== 200) {
          return deferred.reject(new Error('Failed to publish the package. The publish service returned an error - ' + resp.statusMessage + ' (' + resp.statusCode + '): ' + body));
        }

        fs.unlink(zipFilePath, function (err) {
          if (err) {
            return deferred.reject(err);
          }

          return deferred.resolve();
        });
      });
  });

  return deferred.promise.nodeify(callback);
}

var makeAppx = function (appFolder, outputPath, shouldSign, callback) {
  console.log('makeappx folder', appFolder);
  var name = 'windows';
  var appxFile = path.join(outputPath, name + '.appx');
  return validateManifestPublisherDetails(appFolder, shouldSign).then(function () {
    // call sign endpoint or traditional
    if (shouldSign === true) {
      log.debug('Invoking the CloudAppX service to generate a signed APPX package');
      return invokeCloudAppX(name, appFolder, appxFile, 'buildsigned');
    }
    else {
      return Q.fcall(cloudappx.makePri, appFolder, appFolder)
        .thenResolve({ 'dir': appFolder, 'name': name, 'out': outputPath, 'shouldSign': shouldSign })
        .then(cloudappx.makeAppx)
        .catch(function () {
          log.debug('Unable to create the package locally. Invoking the CloudAppX service instead...');
          return invokeCloudAppX(name, appFolder, appxFile, 'build');
        });
    }
  })
  .nodeify(callback);
};

var makePri = function (appFolder, outputPath, callback) {
  var name = 'resources';
  return Q.fcall(cloudappx.makePri, appFolder, outputPath).catch(function () {
    log.info('Unable to index resources locally. Invoking the CloudAppX service instead...');
    var priFile = path.join(outputPath, name + '.pri');
    return invokeCloudAppX(name, appFolder, priFile, 'makepri');
  })
  .nodeify(callback);
};

var makeWeb = function (appFolder, outputPath, appName, callback) {
  var deferred = Q.defer();
  var archive = archiver('zip');
  var packagePath = path.join(outputPath, (appName ? appName : 'windows') + '.web');
  var output = fs.createWriteStream(packagePath);
  var manifestPath = path.resolve(appFolder, '../manifest.json');

  archive.on('error', function (err) {
    deferred.reject(err);
  });

  archive.pipe(output);

  output.on('close', function() {
      deferred.resolve(packagePath);
  });

  archive.glob('**/*.*', { cwd: appFolder, ignore: 'appxmanifest.xml' });
  archive.file(manifestPath, { name: 'manifest.json' });
  archive.finalize();

  return deferred.promise.nodeify(callback);
};

var autoPublish = function (platformDir, name, email, appName, callback) {
  log.debug('Invoking the AutoPublish service at ' + publishEndpoint + ' to publish .web package');
  return invokeAutoPublish(platformDir, name, email, appName)
    .nodeify(callback);
}

module.exports = {
  makeAppx: makeAppx,
  makePri: makePri,
  makeWeb: makeWeb,
  autoPublish: autoPublish
};