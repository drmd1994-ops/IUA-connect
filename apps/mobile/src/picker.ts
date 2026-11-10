import * as ImagePicker from 'expo-image-picker';

/**
 * What every photo and video picker in the app asks for, so a file from an iPhone is one the server
 * accepts (M37 plan §2, item 3). The server takes JPEG, PNG and MP4; an iPhone keeps photos as
 * HEIC and videos as `.mov`. Each option is read on iOS only, so Android is unchanged.
 */
export const PICKER_OPTIONS = {
  quality: 0.9,
  // The photo as JPEG rather than HEIC (Apple's "most compatible" form).
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  // A video exported again as H.264 in an MP4 file. 720p keeps a minute or two of video under the
  // server's 100 MB. Marked deprecated in the types, but it is what the iOS picker still reads to
  // decide whether to convert.
  videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  // A photo kept only in iCloud is downloaded first; without this, choosing it fails.
  shouldDownloadFromNetwork: true,
} satisfies ImagePicker.ImagePickerOptions;
