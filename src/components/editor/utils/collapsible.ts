export function setDomHiddenUntilFound(dom: HTMLElement): void {
  // @ts-expect-error Legacy DOM typings omit the until-found/beforematch browser APIs.
  dom.hidden = "until-found"
}

export function domOnBeforeMatch(dom: HTMLElement, callback: () => void): void {
  // @ts-expect-error Legacy DOM typings omit the until-found/beforematch browser APIs.
  dom.onbeforematch = callback
}
