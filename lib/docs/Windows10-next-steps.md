# Test - Build - Submit

## Test

1. Your application uses the same engine as Microsoft Edge so most of your testing can be done in the browser. However, to test the PWA package locally follow these steps:

- unzip the downloaded folder
- In the unzipped folder you will find a `.ps1` script under `projects\windows10\` called `test_install.ps1`.
- Open Powershell in admin mode in the unzipped folder and run the powershell script by typing `.\projects\windows10\test_install.ps1` in an admin instance of powershell.


## Build

You can use PWA Builder to create an appx of your PWA for submission to the Windows Store. To download a store-ready `appx` choose the `generate` option when you tap the Windows card at `https://pwabuilder.com/publish` and fill in the credentials.

If you would like to have a sideloadble version of your appx for easy sharing with your friends choose the `download` option when you tap the Windows card at `https://pwabuilder.com/publish` and follow the instructions in the testing section above.


## Submit to Store

1. Set up a Microsoft Developer account [here](http://dev.windows.com/en-us).

2. Reserve the name of your app and obtain its identity details (under **App management | App identity**), including _Name_, _Publisher_, and _PublisherDisplayName_.

3. Download a store-ready `appx` by choosing the `generate` option when you tap the Windows card at `https://pwabuilder.com/publish`. You can use the info you obtained in step 2 to fill out the form and download the store ready appx.

4. Upload to the Microsoft store!
