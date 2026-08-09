export const outputNameFor = (fileName) => {
  const baseName = fileName.replace(/\.jpe?g$/i, "");
  return `${/_edited$/i.test(baseName) ? baseName : `${baseName}_edited`}.jpg`;
};

export const isMobileDevice = ({
  userAgent = "",
} = {}) =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

export const canShareFileOnMobile = (navigatorLike, file) => {
  if (
    !isMobileDevice({
      userAgent: navigatorLike.userAgent,
      platform: navigatorLike.platform,
      maxTouchPoints: navigatorLike.maxTouchPoints,
    }) ||
    typeof navigatorLike.share !== "function" ||
    typeof navigatorLike.canShare !== "function"
  ) {
    return false;
  }

  try {
    return navigatorLike.canShare({ files: [file] });
  } catch {
    return false;
  }
};
