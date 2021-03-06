'use strict';

var pwabuilderLib = require('pwabuilder-lib');

var validationConstants = pwabuilderLib.constants.validation;

var Color = require('color');
var constants = require('../constants');

module.exports = function (manifestContent, callback) {
  if (manifestContent.background_color) {
    try {
      var color = Color(manifestContent.background_color);
    } catch(error) {
      return callback(undefined, {
            'description': 'The background color is not a valid color (' + manifestContent.background_color + ')',
            'platform': constants.platform.id,
            'level': validationConstants.levels.warning,
            'members': validationConstants.manifestMembers.background_color,
            'code': validationConstants.codes.invalidValue
          });
    }
  }
  return callback();
};
