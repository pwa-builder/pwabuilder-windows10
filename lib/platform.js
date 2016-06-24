'use strict';

var fs = require('fs'),
    path = require('path'),
    util = require('util');
    
var hwa = require('hwa'),
    Q = require('q');

var lib = require('manifoldjs-lib');

var CustomError = lib.CustomError,
    fileTools = lib.fileTools,
    PlatformBase = lib.PlatformBase,
    projectTools = lib.projectTools,
    utils = lib.utils;

var constants = require('./constants'),
    manifest = require('./manifest'),
    appPackage = require('./appPackage');
   
function Platform (packageName, platforms) {

  var self = this;

  PlatformBase.call(this, constants.platform.id, constants.platform.name, packageName, __dirname);

  // save platform list
  self.platforms = platforms;

  // override create function
  self.create = function (w3cManifestInfo, rootDir, options, callback) {
    if (w3cManifestInfo.format !== lib.constants.BASE_MANIFEST_FORMAT) {
      return Q.reject(new CustomError('The \'' + w3cManifestInfo.format + '\' manifest format is not valid for this platform.'));
    }

    self.info('Generating the ' + constants.platform.name + ' app...');
    
    var assetsDir = path.join(self.baseDir, 'assets');
    var platformDir = path.join(rootDir, constants.platform.id);
    var manifestDir = path.join(platformDir, 'manifest');
    var imagesDir = path.join(manifestDir, 'images');
    var sourceDir = path.join(platformDir, 'source');   

    // convert the W3C manifest to a platform-specific manifest
    var platformManifestInfo;
    return manifest.convertFromBase(w3cManifestInfo)
      // if the platform dir doesn't exist, create it
      .then(function (manifestInfo) {
        platformManifestInfo = manifestInfo;         
        self.debug('Creating the ' + constants.platform.name + ' app folder...');
        return fileTools.mkdirp(platformDir);
      })
      // persist the platform-specific manifest
      .then(function () {
        return fileTools.mkdirp(manifestDir).then(function () {
          self.debug('Copying the ' + constants.platform.name + ' manifest to the app folder...');
          var manifestFilePath = path.join(manifestDir, 'appxmanifest.xml');
          return Q.nfcall(fs.writeFile, manifestFilePath, platformManifestInfo.content.rawData)
                  .catch(function (err) {
                    return Q.reject(new CustomError('Failed to copy the manifest to the platform folder.', err));
                  });
        });
      })     
      // download icons to the app's folder
      .then(function () {
        return self.downloadIcons(platformManifestInfo.content, w3cManifestInfo.content.start_url, imagesDir);
      })
      // copy the offline page
      .then(function () {
        var fileName = 'msapp-error.html';
        var source = path.join(assetsDir, fileName);
        var target = path.join(manifestDir, fileName);
      
        self.info('Copying offline file "' + fileName + '" to target: ' + target + '...');
      
        return fileTools.copyFile(source, target);        
      })
      // Save the w3c manifest for .web package generation
      .then(function () {
        self.info('Saving the original W3C manifest to the app folder...');
        var w3cManifestFilePath = path.join(platformDir, 'manifest.json');
        return Q.nfcall(fs.writeFile, w3cManifestFilePath, JSON.stringify(w3cManifestInfo.content, null, 4))
                .catch(function (err) {
                  return Q.reject(new CustomError('Failed to save the W3C manifest to the platform folder.', err));
                });        
      })
      // copy project assets to the source folder 
      .then(function () {
        var projectAssetsDir = path.join(assetsDir, 'project');
        return fileTools.copyFolder(projectAssetsDir, sourceDir)
          .catch(function (err) {
            return Q.reject(new CustomError('Failed to copy the project assets to the source folder.', err));
          });
      })
      // copy the manifest and icon files to the source project
      .then(function () {
        self.info('Copying files to the ' + constants.platform.name + ' source project...');
        return fileTools.copyFolder(manifestDir, sourceDir, {
          clobber: true,
          filter: function (file) { return path.basename(file) !== 'appxmanifest.xml'; } });
      })      
      // update the source project's application manifest (package.appxmanifest) 
      .then(function () {
        var packageManifestPath = path.join(sourceDir, 'package.appxmanifest');
        return fileTools.replaceFileContent(packageManifestPath,
          function (data) {
            return manifest.replaceManifestValues(w3cManifestInfo, data);
          })
          .catch(function (err) {
            return Q.reject(new CustomError('Failed to update the application manifest \'package.appxmanifest\'.', err));
          });
      })     
      // copy the documentation
      .then(function () {
        return self.copyDocumentation(platformDir);
      })      
      // write generation info (telemetry)
      .then(function () {
        return self.writeGenerationInfo(w3cManifestInfo, platformDir);
      })
      .nodeify(callback);
  };

  // override package function
  self.package = function (projectDir, options, callback) {
      
    //set flags for .web packaging and signing operations
    var shouldSign = false,
        dotWeb = false;

    if (options.DotWeb) {
      self.info('Generating .web package for submission to the store.');
      dotWeb = true;
    } else if (options.Sign) {
      self.info('The ' + constants.platform.name + ' app received a Sign flag and will be signed by CloudAppx!');
      shouldSign = true;
    }

    self.info('Packaging the ' + constants.platform.name + ' app...');
    
    var platformDir = path.join(projectDir || process.cwd(), constants.platform.id);
    var directory = path.join(platformDir, 'manifest');
    var outputPath = path.join(platformDir, 'package');

    return fileTools.mkdirp(outputPath).then(function () {
      if (dotWeb) {
        return appPackage.makeWeb(directory, outputPath);
      } else {
        // creates App Store package for publishing
        return appPackage.makeAppx(directory, outputPath, shouldSign);
      }
    })
    .nodeify(callback);
  };

  self.run = function (projectDir, options, callback) {

    if (!utils.isWindows) {
      return Q.reject(new Error('Windows projects can only be executed in Windows environments.')).nodeify(callback);
    }
    
    try {
      self.info('Launching the ' + constants.platform.name + ' app...');

      var platformDir = path.join(projectDir || process.cwd(), constants.platform.id);
      var sourcePath = path.join(platformDir, 'manifest');
      
      // index resources, register, and launch app
      return appPackage.makePri(sourcePath, sourcePath).then(function () {
        var manifestPath = path.join(sourcePath, 'appxmanifest.xml');
        return Q(hwa.registerApp(manifestPath)).nodeify(callback);
      })
    }
    catch (err) {
      return Q.reject(err).nodeify(callback);
    }
  };
  
  self.open = function (projectDir, options, callback) {
    if (process.platform !== 'win32') {
      return Q.reject(new Error('Visual Studio projects can only be opened in Windows environments.')).nodeify(callback);
    }
    
    var platformDir = path.join(projectDir || process.cwd(), constants.platform.id);
    var projectFilename = path.join(platformDir, 'source', 'App.jsproj');
    return projectTools.openVisualStudioProject(projectFilename).nodeify(callback);
  };
}

util.inherits(Platform, PlatformBase);

module.exports = Platform;
