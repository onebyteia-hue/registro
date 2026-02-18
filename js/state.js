export const state = {
  user: null,              // Firebase user
  profile: null,           // user_bautizo/{uid} data
  profileRefId: null,      // uid
  padrinosCache: [],       // list
  unsubscribers: [],       // clean listeners if needed
};

export function setUser(u){ state.user = u; }
export function setProfile(p){ state.profile = p; }
export function clearProfile(){ state.profile = null; state.profileRefId = null; }
