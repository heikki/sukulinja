// A dataset's Photos, added and deleted in the app, and the Tags made on
// them (ADR-0017).

export { openPhotoFiles } from './files';
export type { PhotoFiles } from './files';
export { createPhotos } from './photos';
export type { Photos } from './photos';
export { openTags, photoName } from './tags';
export type { Tags } from './tags';
export { photoOperations, routeAddPhoto } from './operations';
