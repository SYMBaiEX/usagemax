# UsageMax native icon

Original vector mark, paired with the website's orange ribbon sculpture. No competitor artwork included.

The editable `UsageMax.icon` bundle contains the vector layer and native material settings. Export with Apple's installed Icon Composer renderer:

```sh
"/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool" brand/icon-composer/UsageMax.icon --export-image --output-file public/brand/icon-light.png --platform iOS --rendition Default --width 512 --height 512 --scale 1
"/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool" brand/icon-composer/UsageMax.icon --export-image --output-file public/brand/icon-dark.png --platform iOS --rendition Dark --width 512 --height 512 --scale 1
node scripts/build-brand-assets.mjs
```

Verified with Icon Composer 1.6 (99.1). The minimal native format uses an `extended-srgb` fill; the renderer supplies the dark appearance. Schema versions differ, so round-trip/export validation is required before changing material fields.
