'use strict';

var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    readline = require('readline');

var Q = require('q');

var lib = require('pwabuilder-lib');

var CustomError = lib.CustomError,
    fileTools = lib.fileTools,
    PlatformBase = lib.PlatformBase,
    projectTools = lib.projectTools,
    manifestTools = lib.manifestTools,
    utils = lib.utils;

var constants = require('./constants'),
    manifest = require('./manifest'),
    appPackage = require('./appPackage'),
    project = require('./project');

function Platform (packageName, platforms) {

  var self = this;

  PlatformBase.call(this, constants.platform.id, constants.platform.name, packageName, __dirname);

  // save platform list
  self.platforms = platforms;

  function isValidEmail(email) {
    var emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return emailRegex.test(email);
  }

  function createReadlineInterface() {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  self.updateEmbeddedIconUriW3C = function(uri) {
    return ('/manifest/images/' + uri).replace('//', '/');
  }

  // override create function
  self.create = function (w3cManifestInfo, rootDir, options, href, callback) {
    if (w3cManifestInfo.format !== lib.constants.BASE_MANIFEST_FORMAT) {
      return Q.reject(new CustomError('The \'' + w3cManifestInfo.format + '\' manifest format is not valid for this platform.'));
    }

    self.info('Generating the ' + constants.platform.name + ' app...');

    var assetsDir = path.join(self.baseDir, 'assets');
    var platformDir = self.getOutputFolder(rootDir);
    var manifestDir = path.join(platformDir, 'appxmanifest');
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
        // if the platform supports embedded icons then it should provided the original w3c manifest
        // within the content as __w3cManifestInfo member because the downloadIcons fcn updates it
        platformManifestInfo.content.__w3cManifestInfo = w3cManifestInfo;

        return self.downloadIcons(platformManifestInfo.content, w3cManifestInfo.content.start_url, imagesDir);
      })
      //copy the run ps script for testing
      .then(function (){
        var fileName = 'test_install.ps1';
        var source = path.join(assetsDir, fileName);
        var target = path.join(platformDir, fileName);
      
        self.info('Copying run test file "' + fileName + '" to target: ' + target + '...');
        return fileTools.copyFile(source, target);  
      })
      // copy the offline page
      .then(function () {
        var fileName = 'msapp-error.html';
        var source = path.join(assetsDir, fileName);
        var target = path.join(manifestDir, fileName);

        self.info('Copying offline file "' + fileName + '" to target: ' + target + '...');

        return fileTools.copyFile(source, target);
      })
      //run makePRI so it works on xbox et all
      .then(function(){
        return appPackage.makePri(manifestDir, manifestDir).catch(function (err) {
          self.warn('Failed to compile the application resources (makePri). ' + err.message);
        });
      })
      // Save the w3c manifest for .web package generation
      .then(function () {
        self.info('Saving the original W3C manifest to the app folder...');
        var w3cManifestFilePath = path.join(rootDir, 'manifest.json');
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
      // remove missing images from manifest and project XMLs
      .then(function() {
        var assets;

        // adding default images first
        return fileTools.readFolder(path.join(assetsDir, 'images')).then(function(files) {
          assets = files;
        }).then(function() {
          return fileTools.readFolder(imagesDir).then(function(files) {
            files.forEach(function(file) {
              if (assets.indexOf(file) < 0) {
                assets.push(file);
              }
            });

            self.debug('Removing missing images not found in the downloaded assets: ' + assets);

            return Q.allSettled([
              manifest.removeMissingImagesFromXml(manifestDir, assets),
              project.removeMissingImagesFromXml(sourceDir, assets)
            ]).catch(function(err) {
              return Q.reject(new CustomError('Failed while updating images at XML manifest and project files.', err));
            });
          });
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
        dotWeb = false,
        autoPublish = false;

    if (options.DotWeb) {
      self.info('Generating .web package for submission to the store.');
      dotWeb = true;
    } else if (options.AutoPublish) {
      self.info('The ' + constants.platform.name + ' app received an AutoPublish flag and will be auto published');
      autoPublish = true;
    } else if (options.Sign) {
      self.info('The ' + constants.platform.name + ' app received a Sign flag and will be signed by CloudAppx!');
      shouldSign = true;
    }

    self.info('Packaging the ' + constants.platform.name + ' app...');

    var platformDir = self.getOutputFolder(projectDir || process.cwd());
    var directory = path.join(platformDir, 'appxmanifest');
    var outputPath = path.join(platformDir, 'package');
    var w3cManifestFilePath = path.join(platformDir, 'manifest.json');

    return fileTools.mkdirp(outputPath).then(function () {
      if (dotWeb) {
        return appPackage.makeWeb(directory, outputPath);
      } else if (autoPublish) {

        var askName = function() {
          var defer = Q.defer();

          if (options.autoPublishName) {
            defer.resolve(options.autoPublishName);
          } else {
            var rl = createReadlineInterface();
            rl.question('Please enter your name or company name: ', function(name) {
              rl.close();
              defer.resolve(name);
            });
          }

          return defer.promise;
        }

        var askEmailAddressWithRetry = function(name) {
          return askEmailAddress(name)
            .then(function (email) {
              return email;
            }, function (error) {
              self.warn(error.toString());
              return askEmailAddressWithRetry(name);
           });
        }

        var askEmailAddress = function(name) {
          var defer = Q.defer();

          if (options.autoPublishEmail) {
            defer.resolve([name, options.autoPublishEmail]);
          } else {
            var rl = createReadlineInterface();
            rl.question('Please enter your email address: ', function(email)  {
              if (isValidEmail(email)) {
                rl.close()
                defer.resolve([name, email]);
              } else {
                defer.reject(new CustomError("The entered email address is invalid. Please try again."));
              }
            });
          }

          return defer.promise;
        }

        return manifestTools.getManifestFromFile(w3cManifestFilePath, lib.constants.BASE_MANIFEST_FORMAT).then(function(manifestInfo) {

          if (manifestInfo.content.start_url && manifestInfo.content.start_url.indexOf('https') !== 0) {
              return Q.reject(new Error('Unable to AutoPublish, the start_url must be https'));
          }

          var appName = manifestInfo.content.short_name;

          return askName()
            .then(askEmailAddressWithRetry)
            .spread(function(name, email) {
              self.info('Name or Company Name: ' + name);
              self.info('Email: ' + email);
              self.info('App Name: ' + appName);

              self.info('Invoking the AutoPublish service to publish Windows 10 app');
              return appPackage.autoPublish(platformDir, name, email, appName);
          });
        });
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

    var hwa;

    try {
      hwa = require('hwa');
    }
    catch (err) {
      return Q.reject(new Error('Failed to load \'hwa\' module. Try reinstalling pwabuilder dependencies and run the command again.')).nodeify(callback);
    }

    try {
      self.info('Launching the ' + constants.platform.name + ' app...');

      var platformDir = self.getOutputFolder(projectDir || process.cwd());
      var sourcePath = path.join(platformDir, 'manifest');

      // index resources, register, and launch app
      return appPackage.makePri(sourcePath, sourcePath).catch(function (err) {
        self.warn('Failed to compile the application resources. ' + err.message);
      })
      .then(function () {
        var manifestPath = path.join(sourcePath, 'appxmanifest.xml');
        return Q.fcall(hwa.registerApp, manifestPath).nodeify(callback);
      });
    }
    catch (err) {
      return Q.reject(err).nodeify(callback);
    }
  };

  self.open = function (projectDir, options, callback) {
    if (process.platform !== 'win32') {
      return Q.reject(new Error('Visual Studio projects can only be opened in Windows environments.')).nodeify(callback);
    }

    var platformDir = self.getOutputFolder(projectDir || process.cwd());
    var projectFilename = path.join(platformDir, 'source', 'App.jsproj');

    return projectTools.openVisualStudioProject(projectFilename).nodeify(callback);
  };
}

util.inherits(Platform, PlatformBase);

module.exports = Platform;
