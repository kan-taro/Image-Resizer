const pica = window.pica();

// DOM elements
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
let outputMime = '';

// Cropping state
let cropRect = null;          // {x, y, width, height} in preview coordinates
let cropRatios = null;        // relative ratios for scaling robustness
let isSelecting = false;
let startX = 0, startY = 0;
let latestResizedCanvas = null;

// Create a Reset Crop button (hidden by default)
const resetCropBtn = document.createElement('button');
resetCropBtn.id = 'resetCropBtn';
resetCropBtn.textContent = 'Reset Crop';
resetCropBtn.className = 'mt-2 w-full bg-gray-500 text-white py-1 rounded hover:bg-gray-600 hidden';
previewContainer.appendChild(resetCropBtn);

resetCropBtn.addEventListener('click', () => {
  cropRect = null;
  cropRatios = null;
  resetCropBtn.classList.add('hidden');
  updateCanvas();
});

// Mouse interaction for selecting a cropping rectangle
previewCanvas.addEventListener('mousedown', e => {
  if (!originalImage.src) return; // no image loaded yet
  const rect = previewCanvas.getBoundingClientRect();
  startX = (e.clientX - rect.left) * (previewCanvas.width / rect.width);
  startY = (e.clientY - rect.top) * (previewCanvas.height / rect.height);
  isSelecting = true;
});

previewCanvas.addEventListener('mousemove', e => {
  if (!isSelecting) return;
  const rect = previewCanvas.getBoundingClientRect();
  let curX = (e.clientX - rect.left) * (previewCanvas.width / rect.width);
  let curY = (e.clientY - rect.top) * (previewCanvas.height / rect.height);

  // Clamp to canvas bounds
  curX = Math.max(0, Math.min(curX, previewCanvas.width));
  curY = Math.max(0, Math.min(curY, previewCanvas.height));

  const x = Math.min(startX, curX);
  const y = Math.min(startY, curY);
  const w = Math.abs(curX - startX);
  const h = Math.abs(curY - startY);

  if (latestResizedCanvas) {
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.drawImage(latestResizedCanvas, 0, 0);
    // Draw selection rectangle
    ctx.strokeStyle = 'rgba(255,0,0,1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6]);
    ctx.strokeRect(x, y, w, h);
  }
});

previewCanvas.addEventListener('mouseup', e => {
  if (!isSelecting) return;
  isSelecting = false;
  const rect = previewCanvas.getBoundingClientRect();
  let endX = (e.clientX - rect.left) * (previewCanvas.width / rect.width);
  let endY = (e.clientY - rect.top) * (previewCanvas.height / rect.height);

  // Clamp
  endX = Math.max(0, Math.min(endX, previewCanvas.width));
  endY = Math.max(0, Math.min(endY, previewCanvas.height));

  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const w = Math.abs(endX - startX);
  const h = Math.abs(endY - startY);

  if (w > 0 && h > 0) {
    cropRect = { x, y, width: w, height: h };
    // Store ratios relative to current preview size for later scaling
    cropRatios = {
      x: cropRect.x / previewCanvas.width,
      y: cropRect.y / previewCanvas.height,
      width: cropRect.width / previewCanvas.width,
      height: cropRect.height / previewCanvas.height
    };
    resetCropBtn.classList.remove('hidden');
  } else {
    cropRect = null;
    cropRatios = null;
  }
  updateCanvas();
});

// Handle file selection
imageInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  fileName = file.name;
  mimeType = file.type;

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

  // Base dimensions after scaling the original image
  const baseWidth = Math.round(originalImage.width * scale);
  const baseHeight = Math.round(originalImage.height * scale);

  // Temporary canvas to hold the full original image data
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = originalImage.width;
  tmpCanvas.height = originalImage.height;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(originalImage, 0, 0);

  // Off‑screen canvas for the resized image
  let offScreen = document.createElement('canvas');

  if (cropRatios) {
    // Compute absolute cropping coordinates from ratios and current base size
    const cropX = Math.round(cropRatios.x * baseWidth);
    const cropY = Math.round(cropRatios.y * baseHeight);
    const cropW = Math.round(cropRatios.width * baseWidth);
    const cropH = Math.round(cropRatios.height * baseHeight);

    // Resize to the current scale first
    offScreen.width = baseWidth;
    offScreen.height = baseHeight;
    await pica.resize(tmpCanvas, offScreen, { unsharpAmount: 80 });

    // Crop the selected region from the resized image
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const cc = croppedCanvas.getContext('2d');
    cc.drawImage(
      offScreen,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );

    previewCanvas.width = cropW;
    previewCanvas.height = cropH;
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(croppedCanvas, 0, 0);

    pixelSizeSpan.textContent = `${cropW} × ${cropH}`;

    // Estimate file size of the cropped image
    await new Promise(resolve => {
      croppedCanvas.toBlob(blob => {
        resizedBlob = blob;
        const kb = (blob.size / 1024).toFixed(1);
        sizeInfo.textContent = `Estimated size: ${kb} KB`;
        resolve();
      }, outputMime, 0.92);
    });

    latestResizedCanvas = croppedCanvas;
  } else {
    // No cropping – just resize the whole image
    offScreen.width = baseWidth;
    offScreen.height = baseHeight;
    await pica.resize(tmpCanvas, offScreen, { unsharpAmount: 80 });

    previewCanvas.width = baseWidth;
    previewCanvas.height = baseHeight;
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(offScreen, 0, 0);

    pixelSizeSpan.textContent = `${baseWidth} × ${baseHeight}`;

    await new Promise(resolve => {
      offScreen.toBlob(blob => {
        resizedBlob = blob;
        const kb = (blob.size / 1024).toFixed(1);
        sizeInfo.textContent = `Estimated size: ${kb} KB`;
        resolve();
      }, outputMime, 0.92);
    });

    latestResizedCanvas = offScreen;
  }
}

downloadBtn.addEventListener('click', () => {
  if (!resizedBlob) return;
  const url = URL.createObjectURL(resizedBlob);
  const a = document.createElement('a');
  const parts = fileName.split('.');
  const ext = parts.pop();
  const base = parts.join('.');

  // For GIFs, output as PNG
  const downloadExt = mimeType === 'image/gif' ? 'png' : ext;
  a.href = url;
  a.download = `${base}_resized.${downloadExt}`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
});