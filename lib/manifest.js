'use strict';

var url = require('url'),
    fs = require('fs'),
    path = require('path');

var Q = require('q');

var lib = require('pwabuilder-lib'),
    CustomError = lib.CustomError,
    packageTools = lib.packageTools,
    fileTools = lib.fileTools,
    utils = lib.utils;

var Color = require('color'),
    DOMParser = require('xmldom').DOMParser;

var common = require('./common'),
    constants = require('./constants');

var metadataItemTemplate = '\r\n\t\t<build:Item Name="{0}" Value="{1}" />';

var rotationMap = {
  'any':                  'portrait',
  'natural':              'portrait',
  'portrait':             'portrait',
  'portrait-primary':     'portrait',
  'portrait-secondary':   'portraitFlipped',
  'landscape':            'landscape',
  'landscape-primary':    'landscape',
  'landscape-secondary':  'landscapeFlipped',
};

// see Guidelines for tile and icon assets
//   https://msdn.microsoft.com/en-us/windows/uwp/controls-and-patterns/tiles-and-notifications-app-assets
var scaleMap = [ '100', '125', '150', '200', '400' ];

var iconMap = {
  'Square71x71Logo':    [   '71x71',    '89x89',	 '107x107',  	'142x142',	  '284x284' ],
  'Square150x150Logo':  [ '150x150',	'188x188',	 '225x225',	  '300x300',	  '600x600' ],
  'Wide310x150Logo':    [ '310x150',  '388x188',	 '465x225',	  '620x300',	 '1240x600' ],
  'Square310x310Logo':	[ '310x310',  '388x388',	 '465x465',	  '620x620',	'1240x1240' ],
  'Square44x44Logo':    [   '44x44',	  '55x55',  	 '66x66',	    '88x88',	  '176x176' ],
  'StoreLogo':          [   '50x50',    '63x63',     '75x75',   '100x100',    '200x200' ],
  'SplashScreen':       [ '620x300',	'775x375',   '930x450',  '1240x600',  '2480x1200' ]
  //,'BadgeLogo':          [   '24x24',	  '30x30',     '36x36',     '48x48',      '96x96' ]
};

var capabilityMap = {
  'internetclient':               { 'name': 'internetClient',             'type': 'capability' },
  'internetclientserver':         { 'name': 'internetClientServer',       'type': 'capability' },
  'privatenetworkclientserver':   { 'name': 'privateNetworkClientServer', 'type': 'capability' },
  'alljoyn':                      { 'name': 'allJoyn',                    'type': 'capability' },
  'codegeneration':               { 'name': 'codeGeneration',             'type': 'capability' },
  'musiclibrary':                 { 'name': 'musicLibrary',               'type': 'capability2' },
  'pictureslibrary':              { 'name': 'picturesLibrary',            'type': 'capability2' },
  'videoslibrary':                { 'name': 'videosLibrary',              'type': 'capability2' },
  'removablestorage':             { 'name': 'removableStorage',           'type': 'capability2' },
  'appointments':                 { 'name': 'appointments',               'type': 'capability2' },
  'contacts':                     { 'name': 'contacts',                   'type': 'capability2' },
  'phonecall':                    { 'name': 'phoneCall',                  'type': 'capability2' },
  'useraccountinformation':       { 'name': 'userAccountInformation',     'type': 'capability2' },
  'voipcall':                     { 'name': 'voipCall',                   'type': 'capability2' },
  'objects3d':	                  { 'name': 'objects3D',                  'type': 'capability2' },
  'blockedchatmessages':          { 'name': 'blockedChatMessages',        'type': 'capability2' },
  'lowleveldevices':              { 'name': 'lowLevelDevices',            'type': 'capability2' },
  'systemmanagement':             { 'name': 'systemManagement',           'type': 'capability2' },
  'backgroundmediaplayback':      { 'name': 'backgroundMediaPlayback',    'type': 'capability3' },
  'usernotificationlistener':     { 'name': 'userNotificationListener',   'type': 'capability3' },
  'recordedcallsfolder':          { 'name': 'recordedCallsFolder',        'type': 'mobile' },
  'location':                     { 'name': 'location',                   'type': 'device' },
  'microphone':                   { 'name': 'microphone',                 'type': 'device' },
  'proximity':                    { 'name': 'proximity',                  'type': 'device' },
  'webcam':                       { 'name': 'webcam',                     'type': 'device' },
  'usb':                          { 'name': 'usb',                        'type': 'device' },
  'humaninterfacedevice':         { 'name': 'humaninterfacedevice',       'type': 'device' },
  'pointofservice':               { 'name': 'pointOfService',             'type': 'device' },
  'bluetooth':                    { 'name': 'bluetooth',                  'type': 'device' },
  'wificontrol':                  { 'name': 'wiFiControl',                'type': 'device' },
  'radios':                       { 'name': 'radios',                     'type': 'device' },
  'optical':                      { 'name': 'optical',                    'type': 'device' },
  'activity':                     { 'name': 'activity',                   'type': 'device' },
};

var capabilityTypeMap = {
  'capability':   'Capability',
  'capability2':  'uap:Capability',
  'capability3':  'uap3:Capability',
  'mobile':       'mobile:Capability',
  'device':       'DeviceCapability'
};

var baseAcurMatch;

var validIconFormats = [
  'png',
  'image/png'
];

function getFormatFromIcon (icon) {
  return icon.type || (icon.src && icon.src.split('.').pop());
}

function isValidIconFormat (icon, validFormats) {
  if (!validFormats || validFormats.length === 0) {
    return true;
  }

  var iconFormat = getFormatFromIcon(icon);

  for (var i = 0; i < validFormats.length; i++) {
    if (validFormats[i].toLowerCase() === iconFormat) {
      return true;
    }
  }

  return false;
}

function findRuleByMatch (acurList, match) {
  for (var i = 0; i < acurList.length; i++) {
    if (acurList[i].match === match) {
      return acurList[i];
    }
  }
}

function tryAddAcurToList (acurList, acur) {
  // if match is '*', replace match with base match
  if (acur.match === '*') {
    acur.match = baseAcurMatch;
  }

  // if the match url ends with '/*', remove the '*'.
  if (acur.match.indexOf('/*', acur.match.length - 2) !== -1) {
    acur.match = acur.match.substring(0, acur.match.length - 1);
  }

  // ensure rule is not duplicated
  var rule = findRuleByMatch(acurList, acur.match);
  if (!rule) {
    // if no type is specified in rule and access is 'none', ignore the rule
    if (!acur.type && acur.runtimeAccess === 'none') {
      return;
    }

    rule = { match: acur.match };
    acurList.push(rule);
  }

  // override the runtimeAccess property (if any) or use default value ('all')
  rule.runtimeAccess = acur.runtimeAccess || rule.runtimeAccess || 'all';

  // override the type (if any) or use default value ('include')
  rule.type = acur.type || rule.type || 'include';
}

function replaceManifestValues (w3cManifestInfo, content) {
  var w3cManifest = w3cManifestInfo.content;
  var timestamp = w3cManifestInfo.timestamp || new Date().toISOString().replace(/T/, ' ').replace(/\.[0-9]+/, ' ');
  var replacedContent = content;
  var guid = utils.newGuid();

  var applicationId = utils.sanitizeName(w3cManifest.short_name);

  // Update general properties
  var appModule = packageTools.getModuleInformation();
  var platformModule = packageTools.getModuleInformation(__filename);

  var backgroundColor;
  if (w3cManifest.background_color) {
    if (w3cManifest.background_color == 'transparent') {
      backgroundColor = w3cManifest.background_color;
    } else {
      try {
        var color = Color(w3cManifest.background_color);
        backgroundColor = color.hex();
      } catch (err) {
        //Previosly validated in the validBackgroundColor.js
      }
    }
  }

  var themeColor;
  if (w3cManifest.theme_color) {
    if (w3cManifest.theme_color == 'transparent') {
      themeColor = w3cManifest.theme_color;
    } else {
      try {
        var color = Color(w3cManifest.theme_color);
        themeColor = color.hex();
      } catch (err) {
        //Previosly validated in the validThemeColor.js
      }
    }
  }

  var shortName;
  if (w3cManifest.short_name) {
    shortName = w3cManifest.short_name.replace(/\s*$/,'');
  }
  else {
    shortName = 'myPWABuilderApp'
  }

  replacedContent = replacedContent.replace(/{IdentityName}/g, guid)
                                    .replace(/{PhoneProductId}/g, guid)
                                    .replace(/{DisplayName}/g, shortName)
                                    .replace(/{ApplicationId}/g, applicationId)
                                    .replace(/{StartPage}/g, w3cManifest.start_url)
                                    .replace(/{Description}/g, w3cManifest.description || w3cManifest.name || w3cManifest.short_name)
                                    .replace(/{RotationPreference}/g, rotationMap[w3cManifest.orientation] || 'portrait')
                                    .replace(/{GenerationTool}/g, appModule.name)
                                    .replace(/{GenerationToolVersion}/g, appModule.version)
                                    .replace(/{PlatformId}/g, constants.platform.id)
                                    .replace(/{PlatformPackage}/g, platformModule.name)
                                    .replace(/{PlatformVersion}/g, platformModule.version)
                                    .replace(/{GeneratedFrom}/g, w3cManifestInfo.generatedFrom || 'API')
                                    .replace(/{GenerationDate}/g, timestamp)
                                    .replace(/{theme_color}/g, backgroundColor || themeColor || 'blue');

  // Add additional metadata items
  var metadataItems = '';
  if (w3cManifestInfo.generatedUrl) {
    metadataItems += metadataItemTemplate.replace(/\{0}/g, 'GeneratedURL')
                                         .replace(/\{1}/g, w3cManifestInfo.generatedUrl);
  }

  replacedContent = replacedContent.replace(/{MetadataItems}/g, metadataItems);

  // Update ACURs
  var indentationChars = '\r\n\t\t\t\t';
  var applicationContentUriRules = '';
  var acurList = [];

  // Set the base acur rule using the start_url's base url
  baseAcurMatch = url.resolve(w3cManifest.start_url, '/');
  if (w3cManifest.scope && w3cManifest.scope.length) {
    // If the scope is defined, the base access rule is defined by the scope
    var parsedScopeUrl = url.parse(w3cManifest.scope);

    if (parsedScopeUrl.host && parsedScopeUrl.protocol) {
      baseAcurMatch = w3cManifest.scope;
    } else {
      baseAcurMatch = url.resolve(baseAcurMatch, w3cManifest.scope);
    }
  }

  // Add base rule to ACUR list
  tryAddAcurToList(acurList, { 'match': baseAcurMatch, 'type': 'include' });

  // Add rules from mjs_access_whitelist to ACUR list
  // TODO: mjs_access_whitelist is deprecated. Should be removed in future versions
  if (w3cManifest.mjs_access_whitelist) {
    w3cManifest.mjs_access_whitelist.forEach(function(whitelistRule) {
      tryAddAcurToList(acurList, { 'match': whitelistRule.url, 'type': 'include', 'runtimeAccess': whitelistRule.apiAccess });
    });
  }

  // Add rules from mjs_extended_scope to ACUR list
  if (w3cManifest.mjs_extended_scope) {
    w3cManifest.mjs_extended_scope.forEach(function(scopeRule) {
      tryAddAcurToList(acurList, { 'match': scopeRule, 'type': 'include' });
    });
  }

  // Add rules from mjs_api_access to ACUR list
  if (w3cManifest.mjs_api_access) {
    w3cManifest.mjs_api_access.forEach(function (apiRule) {
      // ensure rule applies to current platform
      if (apiRule.platform && apiRule.platform.split(',')
           .map(function (item) { return item.trim(); })
           .indexOf('windows10') < 0) {
                return false;
      }

      tryAddAcurToList(acurList, { match: apiRule.match, runtimeAccess: apiRule.access || 'all' });
    });
  }

  // Create XML entries for ACUR rules
  acurList.forEach(function (acur) {
    applicationContentUriRules += indentationChars + '<uap:Rule Type="' + acur.type + '" WindowsRuntimeAccess="' + acur.runtimeAccess + '" Match="' + acur.match + '" />';
  });

  replacedContent = replacedContent.replace(/{ApplicationContentUriRules}/g, applicationContentUriRules);

  // Add capabilities
  var capabilities = '',
      deviceCapabilities = '';
  if (w3cManifest.mjs_capabilities) {
    w3cManifest.mjs_capabilities.forEach(function (capability) {
      // ensure rule applies to current platform
      if (capability.platform) {
        if (capability.platform && capability.platform.split(',')
            .map(function (item) { return item.trim(); })
            .indexOf('windows10') < 0) {
                  return false;
        }
      }

      var capabilityName = typeof capability !== 'string' && capability.name ? capability.name : capability;
      var mappedCapability = capabilityMap[capabilityName.toLowerCase()];

      if (mappedCapability) {
        if (mappedCapability.type === 'device') {
          deviceCapabilities += indentationChars + '<' + capabilityTypeMap[mappedCapability.type] + ' Name="' + mappedCapability.name + '" />';
        } else {
          capabilities += indentationChars + '<' + capabilityTypeMap[mappedCapability.type] + ' Name="' + mappedCapability.name + '" />';
        }
      }
    });
  }

  capabilities += deviceCapabilities;

  replacedContent = replacedContent.replace(/{Capabilities}/g, capabilities);

  return replacedContent;
}

function classifyIconBySize (manifestIcons, map, icon) {
  for (var elementName in map) {
    var elementSizes = map[elementName];
    var index = elementSizes.indexOf(icon.sizes.toLowerCase());
    if (index >= 0) {
      manifestIcons[elementSizes[index]] = { 'url': icon.src, 'fileName': elementName + '.scale-' + scaleMap[index] + '.png' };
    }
  }
}

function convertFromBase (manifestInfo, callback) {

  if (!manifestInfo || !manifestInfo.content) {
    return Q.reject(new Error('Manifest content is empty or not initialized.')).nodeify(callback);
  }

  var originalManifest = manifestInfo.content;

  if (!originalManifest.start_url) {
    return Q.reject(new Error('Start URL is required.')).nodeify(callback);
  }

  var manifestTemplatePath = path.join(__dirname, 'assets', 'appxmanifest-template.xml');

  return Q.nfcall(fs.readFile, manifestTemplatePath).then(function (data) {
    var timestamp = manifestInfo.timestamp || new Date().toISOString().replace(/T/, ' ').replace(/\.[0-9]+/, ' ');

    var rawManifest = data.toString();
    rawManifest = replaceManifestValues(manifestInfo, rawManifest);

    // process tile images and logos
    var icons = {};
    if (originalManifest.icons && originalManifest.icons.length) {
      for (var i = 0; i < originalManifest.icons.length; i++) {
        var icon = originalManifest.icons[i];
        if (isValidIconFormat(icon, validIconFormats)) {
          classifyIconBySize(icons, iconMap, icon);
        }
      }
    }

    var manifest = {
      'rawData': rawManifest,
      'icons': icons,
    };

    var convertedManifestInfo = {
      'content': manifest,
      'format': lib.constants.WINDOWS10_MANIFEST_FORMAT,
      'timestamp' : timestamp
    };

    if (manifestInfo.generatedUrl) {
      convertedManifestInfo.generatedUrl = manifestInfo.generatedUrl;
    }

    if (manifestInfo.generatedFrom) {
      convertedManifestInfo.generatedFrom = manifestInfo.generatedFrom;
    }

    return convertedManifestInfo;
  })
  .catch(function (err) {
    return Q.reject(new CustomError('Could not read the manifest template', err));
  })
  .nodeify(callback);
}

function removeMissingImagesFromXml(projectDir, assets) {
  var manifestFile = path.join(projectDir, 'appxmanifest.xml');

  return fileTools.readFile(manifestFile, 'utf-8').then(function(xml) {
    var doc = new DOMParser().parseFromString(xml);

    common.processXmlElements(
      assets,
      doc.getElementsByTagName(common.xmlElements.uapLockScreen),
      common.xmlAttributes.badgeLogo);
    common.processXmlElements(
      assets,
      doc.getElementsByTagName(common.xmlElements.uapSplashScreen),
       common.xmlAttributes.image);
    common.processXmlElements(
      assets,
      doc.getElementsByTagName(common.xmlElements.uapDefaultTile));

    return doc.toString();
  }).then(function(updatedXml) {
    return fileTools.writeFile(manifestFile, updatedXml, 'utf-8');
  }).fail(function(err) {
    return Q.reject(new CustomError('Could not update the manifest XML file', err));
  });
}

module.exports = {
  convertFromBase: convertFromBase,
  replaceManifestValues: replaceManifestValues,
  removeMissingImagesFromXml: removeMissingImagesFromXml
};
