'use strict';

var manifoldjsLib = require('manifoldjs-lib');

var imageGroupValidation =  manifoldjsLib.manifestTools.imageGroupValidation;

var constants = require('../constants');

module.exports = function (manifestContent, callback) {
  var description = 'A small square *black and white* badge of any of the following sizes is required for Windows: 24x24, 48x48',
      platform = constants.platform.id,
      validIconSizes = ['24x24', '48x48'];

  imageGroupValidation(manifestContent, description, platform, validIconSizes, callback);
};
