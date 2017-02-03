'use strict';

var manifoldjsLib = require('xanifoldjs-lib');

var imageGroupValidation =  manifoldjsLib.manifestTools.imageGroupValidation;

var constants = require('../constants');

module.exports = function (manifestContent, callback) {
  var description = 'It appears that some image sizes used on Windows 10 are not in your Manifest.  We will leave off any we can, and add defaults for any necessary images that are missing',
      platform = constants.platform.id,
      validIconSizes = ['120x120', '150x150','210x210','270x270', '620x300', '868x420', '1116x540'];

  imageGroupValidation(manifestContent, description, platform, validIconSizes, callback);
};
