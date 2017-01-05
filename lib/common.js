'use strict';

var xmlElements = {
	uapLockScreen: 'uap:LockScreen',
	uapSplashScreen: 'uap:SplashScreen',
	uapDefaultTile: 'uap:DefaultTile',
	itemGroup: 'ItemGroup',
	content: 'Content'
};

var xmlAttributes = {
	badgeLogo: 'BadgeLogo',
	splashScreen: 'SplashScreen',
	square310x310Logo: 'Square310x310Logo',
	wide310x150Logo: 'Wide310x150Logo',
	square71x71Logo: 'Square71x71Logo',
	image: 'Image',
	include: 'Include'
};

function nodeListToArray(list) {
	var results = [ ];

	for (var i = 0; i < list.length; i++) {
		results.push(list.item(i));
	}

	return results;
}

function processCustomXmlElement(element) {
	if (element.tagName === xmlElements.uapDefaultTile) {
		var has310x310 = element.getAttributeNode(xmlAttributes.square310x310Logo);
		var has310x150 = element.getAttributeNode(xmlAttributes.wide310x150Logo);

		if (has310x310 && !has310x150) {
			element.removeAttribute(xmlAttributes.square310x310Logo);
		}
	} else if (element.tagName === xmlElements.itemGroup) {
		var has310x310 = [ ];
		var has310x150 = [ ];

		nodeListToArray(element.getElementsByTagName(xmlElements.content)).forEach(function(content) {
			var includeAttrValue = content.getAttribute(xmlAttributes.include);
			if (includeAttrValue.indexOf(xmlAttributes.square310x310Logo) > -1) {
				has310x310.push(content);
			} else if (includeAttrValue.indexOf(xmlAttributes.wide310x150Logo) > -1) {
				has310x150.push(content);
			}
		});

		if (has310x310.length > 0 && has310x150.length === 0) {
			has310x310.forEach(function(content) {
				element.removeChild(content);
			});
		}
	}
}

function processXmlElements(assets, elementList, attributeName, customProcessParent) {
	var elements = nodeListToArray(elementList);

	elements.forEach(function(element) {
		var attributes;
		if (attributeName) {
			attributes = [ element.getAttributeNode(attributeName) ];
		} else {
			attributes = nodeListToArray(element.attributes);
		}

		var removeCandidate = false;
		attributes.forEach(function(attribute) {
			if (!attribute) { return };

			var found = false;
			assets.forEach(function(asset) {
				if (!customProcessParent) {
					asset = asset.split('.')[0];
				}

				found |= attribute.value.indexOf(asset) > -1;
			});

			if (!found) {
				element.removeAttributeNode(attribute);
				removeCandidate = true;
			}
		});

		// if element has conditional requirements
		if (!customProcessParent) { processCustomXmlElement(element); }

		if (element.attributes.length === 0 || (attributeName && removeCandidate)) {
			element.parentNode.removeChild(element);
		}
	});

	if (customProcessParent) {
		processCustomXmlElement(elements[0].parentNode);
	}
}

module.exports = {
	processXmlElements: processXmlElements,
	xmlElements: xmlElements,
	xmlAttributes: xmlAttributes
}
