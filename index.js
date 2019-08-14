/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const fetch = require('node-fetch');
const cache = require('./src/cache');
const auth = require('@adobe/jwt-auth');
const merge = require('deepmerge');
const NO_CONFIG = 'Auth configuration missing.';

async function getToken(options, tokenCache, forceNewToken) {
  if (!options.auth || !options.auth.clientId || !options.auth.metaScopes) {
    throw NO_CONFIG;
  }

  const key = options.auth.clientId + '|' + options.auth.metaScopes.join(',');

  let token = await tokenCache.get(key);

  if (token && !forceNewToken) {
    return token;
  } else {
    try {
      token = await auth(options.auth);
      if (token) {
        return tokenCache.set(key, token);
      } else {
        throw 'Access token came empty.';
      }
    } catch (err) {
      console.error('Error while getting a new access token.', err);
      throw err;
    }
  }
}

function addAuthHeaders(token, options) {
  return merge(options, {
    headers: {
      authorization: `${token.token_type} ${token.access_token}`,
      'x-api-key': options.auth.clientId,
      'x-gw-ims-org-id': options.auth.orgId
    }
  });
}

async function _fetch(url, options, tokenCache, forceNewToken) {
  const token = await getToken(options, tokenCache, forceNewToken);
  const opts = addAuthHeaders(token, options);
  const res = await fetch(url, opts);

  if ((res.status === 401 || res.status === 403) && !forceNewToken) {
    return await _fetch(url, options, tokenCache, true);
  } else {
    return res;
  }
}

/**
 * Fetch function
 *
 * @return  Promise
 * @param url
 * @param options
 */
function adobefetch(url, options = {}, tokenCache) {
  return _fetch(url, options, tokenCache, false);
}

function verifyConfig(options) {
  let {
    clientId,
    technicalAccountId,
    orgId,
    clientSecret,
    privateKey,
    metaScopes
  } = options;

  const errors = [];
  !clientId ? errors.push('clientId') : '';
  !technicalAccountId ? errors.push('technicalAccountId') : '';
  !orgId ? errors.push('orgId') : '';
  !clientSecret ? errors.push('clientSecret') : '';
  !privateKey ? errors.push('privateKey') : '';
  !metaScopes || metaScopes.length === 0 ? errors.push('metaScopes') : '';
  if (errors.length > 0) {
    throw `Required parameter(s) ${errors.join(', ')} are missing`;
  }
}

function config(configOptions) {
  if (!configOptions.auth) {
    throw NO_CONFIG;
  } else {
    verifyConfig(configOptions.auth);
  }

  const tokenCache = cache.config(configOptions.auth);

  return (url, options = {}) =>
    adobefetch(url, merge(configOptions, options), tokenCache);
}

module.exports = { config: config };