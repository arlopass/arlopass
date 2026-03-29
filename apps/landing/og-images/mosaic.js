/* global Image, document */
/**
 * Mosaic renderer — pixelates a source image into chunky tiles.
 * Same technique as the Arlopass landing page hero <canvas>.
 *
 * Usage: add a <canvas data-mosaic-src="path/to/image.webp"></canvas>
 * in your HTML. The script finds all such canvases and renders them.
 *
 * Optional attributes:
 *   data-mosaic-tile="14"  — tile size in px (default 14)
 *
 * Available images (relative from og-images/):
 *   ../public/img/bg1.webp      — green rolling hills
 *   ../public/img/bg2.webp      — golden mountains at sunset
 *   ../public/img/bg3.webp      — aerial patchwork fields
 *   ../public/img/bg4.webp      — hot air balloons, dawn pinks
 *   ../public/img/bg5.webp      — llama at Machu Picchu
 *   ../public/img/bg6.webp      — white daisies, cream bokeh
 *   ../public/img/bg7.webp      — blueberry cake, cool pastels
 *   ../public/img/hero_bg.webp  — bird in treetops, teal & green
 */
(function () {
  function renderMosaic(canvas) {
    var src = canvas.getAttribute("data-mosaic-src");
    if (!src) return;

    var tile = parseInt(canvas.getAttribute("data-mosaic-tile"), 10) || 14;
    var ctx = canvas.getContext("2d");
    var img = new Image();
    img.src = src;

    img.onload = function () {
      var w = canvas.clientWidth;
      var h = canvas.clientHeight;
      canvas.width = w;
      canvas.height = h;

      var cols = Math.ceil(w / tile);
      var rows = Math.ceil(h / tile);

      // Cover-crop: scale image to fill canvas, center, clip overflow
      var imgRatio = img.naturalWidth / img.naturalHeight;
      var canvasRatio = w / h;
      var sx = 0,
        sy = 0,
        sw = img.naturalWidth,
        sh = img.naturalHeight;

      if (imgRatio > canvasRatio) {
        sw = img.naturalHeight * canvasRatio;
        sx = (img.naturalWidth - sw) / 2;
      } else {
        sh = img.naturalWidth / canvasRatio;
        sy = (img.naturalHeight - sh) / 2;
      }

      // Draw at tiny resolution, then scale back up with no smoothing
      var off = document.createElement("canvas");
      off.width = cols;
      off.height = rows;
      off.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, cols, rows, 0, 0, w, h);
    };
  }

  // Run on all matching canvases
  var canvases = document.querySelectorAll("canvas[data-mosaic-src]");
  for (var i = 0; i < canvases.length; i++) {
    renderMosaic(canvases[i]);
  }
})();
