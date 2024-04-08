import * as fs from 'fs';
import * as Path from 'path';
import axios from 'axios';

function poll(pollFn, interval = 100) {
  let intervalHandle = null;
  return {
    until(conditionFn) {
      return new Promise((resolve, reject) => {
        intervalHandle = setInterval(() => {
          pollFn().then(data => {
            let passesCondition = false;
            try {
              passesCondition = conditionFn(data);
            } catch (e) {
              reject(e);
            }
            if (passesCondition) {
              clearInterval(intervalHandle);
              resolve(data);
            }
          }).catch(err => {
            clearInterval(intervalHandle);
            reject(err);
          });
        }, interval);
      });
    }
  };
}

/**
 * Rewrites the given url using the server url from the report file, and replacing the substring with the server override.
 * @param url an original url
 * @param serverUrlFromReport a url that matches sonar.core.serverBaseURL
 * @param serverOverride a url that should replace the sonar.core.serverBaseURL
 * @returns 
 */
function overrideServer(url: string, serverUrlFromReport: string, serverOverride: string) {
  return url.replace(serverUrlFromReport, serverOverride);
}

function getCeTaskUrl(sonarWorkingDir, serverOverride) {
  const lines = fs.readFileSync(Path.join(sonarWorkingDir, 'report-task.txt'), 'utf-8').split('\n');
  let ceTaskUrl = null;
  let serverUrl = null;
  for ( const i in lines ) {
    if (lines[i].startsWith('serverUrl=')) {
      serverUrl = lines[i].substring('serverUrl='.length);
    } else if (lines[i].startsWith('ceTaskUrl=')) {
      ceTaskUrl = lines[i].substring('ceTaskUrl='.length);
    }
  }

  if (ceTaskUrl) {
    if (serverOverride) {
      return overrideServer(ceTaskUrl, serverUrl, serverOverride);
    }
    return ceTaskUrl;
  }
  
  return null;
}

function getQualityGateUrl(sonarWorkingDir, ceTask, serverOverride) {
  let analysisId = null;
  if (ceTask['analysisId']) {
    analysisId = ceTask['analysisId'];
  } else {
    analysisId = ceTask['id'];
  }

  const lines = fs.readFileSync(Path.join(sonarWorkingDir, 'report-task.txt'), 'utf-8').split('\n');
  let projectKey = null;
  let serverUrl = null;
  for (const i in lines) {
    if (lines[i].startsWith('serverUrl=')) {
      serverUrl = lines[i].substring('serverUrl='.length);
    } else if (lines[i].startsWith('projectKey=')) {
      projectKey = lines[i].substring('projectKey='.length);
    }
  }
  if ( serverUrl && projectKey ) {
    const url = serverUrl + '/api/qualitygates/project_status?analysisId=' + analysisId;
    if (serverOverride) {
      return overrideServer(url, serverUrl, serverOverride);
    }
    return url;
  }

  return null;
}

export function pollQualityGate(auth, end, sonarWorkingDir, interval, serverOverride, resolve, reject) {
  const url = getCeTaskUrl(sonarWorkingDir, serverOverride);
  if (!url) {
    reject('ceTaskUrl not found');
    return;
  }

  poll(() => {
    return new Promise((_resolve, _reject) => {
      axios.get(url, {headers: {Authorization: `Basic ${btoa(auth+':')}`}})
        .then(response => {
          const data = response.data;
          if (data.errors) {
            _reject(data.errors[0].msg);
          }
          _resolve(data.task);
        })
        .catch(error => _reject(error));
    });
  }, interval)
  .until(data => {
    return (data.status !== 'IN_PROGRESS' && data.status !== 'PENDING') || new Date().getTime() >= end;
  })
  .then(ceTask => {
    if (ceTask['status'] === 'IN_PROGRESS' || ceTask['status'] === 'PENDING') {
      reject('Quality Gate Timeout');
    } else {
      const qgurl = getQualityGateUrl(sonarWorkingDir, ceTask, serverOverride);
      if (!qgurl) {
        reject('qualityGate url not found');
      } else {
        // fetch quality gate...
        axios.get(qgurl, {headers: {Authorization: `Basic ${btoa(auth+':')}`}})
          .then(response => {
            const data = response.data;
            if (data.errors) {
              reject(data.errors[0].msg);
            }
            resolve(data.projectStatus);
          })
          .catch(error => reject(error));
      }
    }
  })
  .catch(reject);
}
