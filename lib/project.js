'use strict';

var Q = require('q');

var path = require('path');

var lib = require('pwabuilder-lib'),
    CustomError = lib.CustomError,
    fileTools = lib.fileTools;

var DOMParser = require('xmldom').DOMParser;

var common = require('./common');

function removeMissingImagesFromXml(projectDir, assets) {
	var appJsProjFile = path.join(projectDir, 'App.jsproj');
	var manifestFile = path.join(projectDir, 'package.appxmanifest');

	return Q.allSettled([
		fileTools.readFile(appJsProjFile, 'utf-8').then(function(xml) {
			var doc = new DOMParser().parseFromString(xml);

			common.processXmlElements(
				assets,
				doc.getElementsByTagName(common.xmlElements.content),
				common.xmlAttributes.include,
				true);

			return doc.toString();
		}).then(function(updatedXml) {
			return fileTools.writeFile(appJsProjFile, updatedXml, 'utf-8');
		}).catch(function(err) {
			return Q.reject(new CustomError('Could not update the project app file', err));
		}),
		fileTools.readFile(manifestFile, 'utf-8').then(function(xml) {
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
			return Q.reject(new CustomError('Could not update the project package file', err));
		})
	]).fail(function(err) {
		Q.reject(err);
	});
}

module.exports = {
	removeMissingImagesFromXml: removeMissingImagesFromXml
}
