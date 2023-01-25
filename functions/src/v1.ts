import * as express from 'express';
import * as cors from 'cors';
import {https, logger} from 'firebase-functions';
import {bucket, CACHE_MAX_AGE, CACHE_SHARE_MAX_AGE, firestoreService} from './config';
import {Space} from './models/space.model';
import {Content, ContentKind, ContentLink} from './models/content.model';
import {Query} from 'firebase-admin/firestore';

// API V1
const expressV1 = express();
expressV1.use(cors({origin: true}));
expressV1.get('/api/v1/spaces/:spaceId/translations/:locale.json', async (req, res) => {
  logger.info('v1 spaces translations : ' + JSON.stringify(req.params));
  const {spaceId} = req.params;
  let {locale} = req.params;
  const spaceSnapshot = await firestoreService.doc(`spaces/${spaceId}`).get();
  if (!spaceSnapshot.exists) {
    res
      .status(404)
      .header('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_SHARE_MAX_AGE}`)
      .send(new https.HttpsError('not-found', 'Space not found'));
    return;
  }
  const space = spaceSnapshot.data() as Space;
  if (!space.locales.some((it) => it.id === locale)) {
    locale = space.localeFallback.id;
  }
  bucket.file(`spaces/${spaceId}/translations/${locale}.json`).download()
    .then((content) => {
      res
        .header('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_SHARE_MAX_AGE}`)
        .contentType('application/json')
        .send(content.toString());
    })
    .catch(() => {
      res
        .status(404)
        .send(new https.HttpsError('not-found', 'File not found, Publish first.'));
    });
});

expressV1.get('/api/v1/spaces/:spaceId/links', async (req, res) => {
  logger.info('v1 spaces links params: ' + JSON.stringify(req.params));
  logger.info('v1 spaces links query: ' + JSON.stringify(req.query));
  const {spaceId} = req.params;
  const {kind, startSlug} = req.query;
  const spaceSnapshot = await firestoreService.doc(`spaces/${spaceId}`).get();
  if (!spaceSnapshot.exists) {
    res
      .status(404)
      .header('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_SHARE_MAX_AGE}`)
      .send(new https.HttpsError('not-found', 'Space not found'));
    return;
  }
  let contentsQuery: Query = firestoreService.collection(`spaces/${spaceId}/contents`);
  if(kind) {
    contentsQuery = contentsQuery.where('kind','==', kind)
  }
  if (startSlug) {
    contentsQuery = contentsQuery
      .where('fullSlug', '>=', startSlug)
      .where('fullSlug', '<', `${startSlug}~`)
  }
  const contentsSnapshot = await contentsQuery.get();

  const response: ContentLink[] = contentsSnapshot.docs
    .map((contentSnapshot) => {
      const content = contentSnapshot.data() as Content;
      const link: ContentLink = {
        id: contentSnapshot.id,
        kind: content.kind,
        name: content.name,
        slug: content.slug,
        fullSlug: content.fullSlug,
        parentSlug: content.parentSlug,
        createdAt: content.createdAt.toDate().toISOString(),
        updatedAt: content.updatedAt.toDate().toISOString(),
      };
      if (content.kind === ContentKind.PAGE) {
        link.publishedAt = content.publishedAt?.toDate().toISOString();
      }
      return link;
    });
  res
    .header('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_SHARE_MAX_AGE}`)
    .contentType('application/json')
    .send(response);
});

expressV1.get('/api/v1/spaces/:spaceId/contents/:contentId/:locale', async (req, res) => {
  logger.info('v1 spaces content: ' + JSON.stringify(req.params));
  const {spaceId, contentId} = req.params;
  let {locale} = req.params;
  const spaceSnapshot = await firestoreService.doc(`spaces/${spaceId}`).get();
  if (!spaceSnapshot.exists) {
    res
      .status(404)
      .header('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_SHARE_MAX_AGE}`)
      .send(new https.HttpsError('not-found', 'Space not found'));
    return;
  }
  const space = spaceSnapshot.data() as Space;
  if (!space.locales.some((it) => it.id === locale)) {
    locale = space.localeFallback.id;
  }
  bucket.file(`spaces/${spaceId}/contents/${contentId}/${locale}.json`).download()
    .then((content) => {
      res
        .header('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_SHARE_MAX_AGE}`)
        .contentType('application/json')
        .send(content.toString());
    })
    .catch(() => {
      res
        .status(404)
        .send(new https.HttpsError('not-found', 'File not found, Publish first.'));
    });
});
export const v1 = https.onRequest(expressV1);
