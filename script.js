const pica = window.pica();

const imageInput = document.getElementById('imageInput');
const previewContainer = document.getElementById('previewContainer');
const previewCanvas = document.getElementById('previewCanvas');
const sizeInfo = document.getElementById('sizeInfo');
const pixelSizeSpan = document.getElementById('pixelSize');
const scaleRange = document.getElementById('scaleRange');
const scaleValueSpan = document.getElementById('scaleValue');
const downloadBtn = document.getElementById('downloadBtn');

let originalImage = new Image();
let resizedBlob = null;
let fileName = '';
let mimeType = '';
let outputMime = ''; // actual MIME used for toBlob

imageInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  fileName = file.name;
  mimeType = file.type;

  // Decide output MIME: GIFs are converted to PNG (static)
  outputMime = (mimeType === 'image/gif') ? 'image/png' : mimeType;

  const reader = new FileReader();
  reader.onload = evt => { originalImage.src = evt.target.result; };
  reader.readAsDataURL(file);
});

originalImage.addEventListener('load', () => {
  previewContainer.classList.remove('hidden');
  downloadBtn.disabled = false;
  updateCanvas();
});

scaleRange.addEventListener('input', () => {
  scaleValueSpan.textContent = `${scaleRange.value}%`;
  updateCanvas();
});

async function updateCanvas() {
  const scale = scaleRange.value / 100;
  const width = Math.round(originalImage.width * scale);
  const height = Math.round(originalImage.height * scale);

  pixelSizeSpan.textContent = `${width} × ${height}`;

  // create an offscreen canvas for PICA
  const offScreen = document.createElement('canvas');
  offScreen.width = width;
  offScreen.height = height;

  // draw original onto temp canvas to get image data
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = originalImage.width;
  tmpCanvas.height = originalImage.height;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(originalImage, 0, 0);

  // use pica to resize
  await pica.resize(tmpCanvas, offScreen, { unsharpAmount: 80 });

  previewCanvas.width = width;
  previewCanvas.height = height;
  const ctx = previewCanvas.getContext('2d');
  ctx.drawImage(offScreen, 0, 0);

  // estimate size
  await new Promise(resolve => {
    offScreen.toBlob(blob => {
      resizedBlob = blob;
      const kb = (blob.size / 1024).toFixed(1);
      sizeInfo.textContent = `Estimated size: ${kb} KB`;
      resolve();
    }, outputMime, 0.92); // quality for JPEG; ignored otherwise
  });
}

downloadBtn.addEventListener('click', () => {
  if (!resizedBlob) return;
  const url = URL.createObjectURL(resizedBlob);
  const a = document.createElement('a');
  const parts = fileName.split('.');
  const ext = parts.pop();
  const base = parts.join('.');

  // If original was GIF, change extension to .png
  const downloadExt = (mimeType === 'image/gif') ? 'png' : ext;
  a.href = url;
  a.download = `${base}_resized.${downloadExt}`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
});