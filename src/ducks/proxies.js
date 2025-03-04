import * as proxiesAPI from 'a/proxies';
import { getClashAPIConfig } from 'd/app';

// see all types:
// https://github.com/Dreamacro/clash/blob/master/constant/adapters.go

// const ProxyTypeBuiltin = ['DIRECT', 'GLOBAL', 'REJECT'];
// const ProxyGroupTypes = ['Fallback', 'URLTest', 'Selector', 'LoadBalance'];

export const getProxies = s => s.proxies.proxies;
export const getDelay = s => s.proxies.delay;
export const getProxyGroupNames = s => s.proxies.groupNames;

const CompletedFetchProxies = 'proxies/CompletedFetchProxies';
const OptimisticSwitchProxy = 'proxies/OptimisticSwitchProxy';
const CompletedRequestDelayForProxy = 'proxies/CompletedRequestDelayForProxy';

function retrieveGroupNamesFrom(proxies) {
  var groupNames = [];
  var globalAll = [];
  for (const prop in proxies) {
    const p = proxies[prop];
    if (p.all && Array.isArray(p.all)) {
      groupNames.push(prop);
      if (prop === 'GLOBAL') {
        globalAll = p.all;
      }
    }
  }
  if (globalAll) {
    // Put GLOBAL in the end
    globalAll.push('GLOBAL');
    // Sort groups according to its index in GLOBAL group
    groupNames = groupNames
      .map(name => [globalAll.indexOf(name), name])
      .sort((a, b) => a[0] - b[0])
      .map(group => group[1]);
  }
  return groupNames;
}

export function fetchProxies() {
  return async (dispatch, getState) => {
    // TODO handle errors

    const state = getState();
    // TODO this is too aggressive...
    // const proxiesCurr = getProxies(state);
    // if (Object.keys(proxiesCurr).length > 0) return;

    const apiConfig = getClashAPIConfig(state);
    // TODO show loading animation?
    const json = await proxiesAPI.fetchProxies(apiConfig);
    let { proxies = {} } = json;

    const groupNames = retrieveGroupNamesFrom(proxies);

    dispatch({
      type: CompletedFetchProxies,
      payload: { proxies, groupNames }
    });
  };
}

export function switchProxy(name1, name2) {
  return async (dispatch, getState) => {
    const apiConfig = getClashAPIConfig(getState());
    // TODO display error message
    proxiesAPI
      .requestToSwitchProxy(apiConfig, name1, name2)
      .then(
        res => {
          if (res.ok === false) {
            // eslint-disable-next-line no-console
            console.log('failed to swith proxy', res.statusText);
          }
        },
        err => {
          // eslint-disable-next-line no-console
          console.log(err, 'failed to swith proxy');
        }
      )
      .then(() => {
        // fetchProxies again
        dispatch(fetchProxies());
      });
    // optimistic UI update
    const proxiesCurr = getProxies(getState());
    const proxiesNext = { ...proxiesCurr };
    if (proxiesNext[name1] && proxiesNext[name1].now) {
      proxiesNext[name1].now = name2;
    }
    dispatch({
      type: OptimisticSwitchProxy,
      payload: { proxies: proxiesNext }
    });
  };
}

function requestDelayForProxyOnce(name) {
  return async (dispatch, getState) => {
    const apiConfig = getClashAPIConfig(getState());
    const res = await proxiesAPI.requestDelayForProxy(apiConfig, name);
    let error = '';
    if (res.ok === false) {
      error = res.statusText;
    }
    const { delay } = await res.json();

    const delayPrev = getDelay(getState());
    const delayNext = {
      ...delayPrev,
      [name]: {
        error,
        number: delay
      }
    };

    dispatch({
      type: CompletedRequestDelayForProxy,
      payload: { delay: delayNext }
    });
  };
}

export function requestDelayForProxy(name) {
  return async dispatch => {
    await dispatch(requestDelayForProxyOnce(name));
  };
}

export function requestDelayAll() {
  return async (dispatch, getState) => {
    const state = getState();
    const proxies = getProxies(state);
    const keys = Object.keys(proxies);
    const proxyNames = [];
    keys.forEach(k => {
      if (proxies[k].type === 'Vmess' || proxies[k].type === 'Shadowsocks') {
        proxyNames.push(k);
      }
    });
    await Promise.all(proxyNames.map(p => dispatch(requestDelayForProxy(p))));
  };
}

const initialState = {
  proxies: {},
  delay: {},
  groupNames: []
};

export default function reducer(state = initialState, { type, payload }) {
  switch (type) {
    case CompletedRequestDelayForProxy:
    case OptimisticSwitchProxy:
    case CompletedFetchProxies: {
      return { ...state, ...payload };
    }

    default:
      return state;
  }
}
