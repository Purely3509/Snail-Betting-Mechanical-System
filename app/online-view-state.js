function getViewVersion(view) {
  const version = Number(view?.version);
  return Number.isFinite(version) ? version : -1;
}

export function selectOnlineView(currentRecord, incomingView, requestId) {
  if (!incomingView) {
    return currentRecord;
  }

  if (!currentRecord?.view) {
    return { view: incomingView, requestId };
  }

  const currentVersion = getViewVersion(currentRecord.view);
  const incomingVersion = getViewVersion(incomingView);
  if (incomingVersion > currentVersion) {
    return { view: incomingView, requestId };
  }
  if (incomingVersion < currentVersion) {
    return currentRecord;
  }

  return requestId >= (currentRecord.requestId ?? -1)
    ? { view: incomingView, requestId }
    : currentRecord;
}
