export const outputNameFor = (fileName, extension = "jpg") => {
  const baseName = fileName.replace(/\.(?:jpe?g|png|webp)$/i, "");
  const normalizedExtension = extension.toLowerCase() === "jpeg" ? "jpg" : extension.toLowerCase();
  return `${/_edited$/i.test(baseName) ? baseName : `${baseName}_edited`}.${normalizedExtension}`;
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
