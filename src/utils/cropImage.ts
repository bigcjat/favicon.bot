export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  backgroundColor: string = 'transparent',
  borderRadius: number = 0, // 0 to 50 (percentage)
  borderWidth: number = 0, // In pixels relative to the original image crop, but we'll scale it to targetSize
  borderColor: string = '#0F172A'
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  // Use a fixed high resolution for the crop canvas to prevent quality loss
  const targetSize = Math.max(1024, pixelCrop.width);
  canvas.width = targetSize;
  canvas.height = targetSize;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // We need to scale the requested border width (which is relative to the preview size, ~300px)
  // to our target canvas size.
  const scaledBorderWidth = (borderWidth / 300) * targetSize;

  // Save context so we can remove the clip later
  ctx.save();

  // Define the OUTER path for clipping the background and image
  // This path represents the very edge of the shape.
  const defineOuterPath = () => {
    if (borderRadius >= 50) {
      ctx.beginPath();
      ctx.arc(targetSize / 2, targetSize / 2, targetSize / 2, 0, Math.PI * 2);
    } else if (borderRadius > 0) {
      const radius = (borderRadius / 100) * targetSize;
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.arcTo(targetSize, 0, targetSize, targetSize, radius);
      ctx.arcTo(targetSize, targetSize, 0, targetSize, radius);
      ctx.arcTo(0, targetSize, 0, 0, radius);
      ctx.arcTo(0, 0, targetSize, 0, radius);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.rect(0, 0, targetSize, targetSize);
    }
  };

  defineOuterPath();
  ctx.clip();

  // Draw background color
  if (backgroundColor && backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw the image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetSize,
    targetSize
  );

  // Restore context to remove the clip
  ctx.restore();

  // Draw the border on top
  // A canvas stroke is centered on the path. To draw a stroke entirely inside the outer edge,
  // the path must be inset by half the stroke width.
  if (scaledBorderWidth > 0) {
    const inset = scaledBorderWidth / 2;
    const size = targetSize - scaledBorderWidth;
    
    if (borderRadius >= 50) {
      const radius = (targetSize / 2) - inset;
      ctx.beginPath();
      ctx.arc(targetSize / 2, targetSize / 2, radius, 0, Math.PI * 2);
    } else if (borderRadius > 0) {
      const outerRadius = (borderRadius / 100) * targetSize;
      const radius = Math.max(0, outerRadius - inset); // Prevent negative radius
      
      ctx.beginPath();
      ctx.moveTo(inset + radius, inset);
      ctx.arcTo(inset + size, inset, inset + size, inset + size, radius);
      ctx.arcTo(inset + size, inset + size, inset, inset + size, radius);
      ctx.arcTo(inset, inset + size, inset, inset, radius);
      ctx.arcTo(inset, inset, inset + size, inset, radius);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.rect(inset, inset, size, size);
    }

    ctx.lineWidth = scaledBorderWidth;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((file) => {
      if (file) {
        resolve(file);
      } else {
        reject(new Error('Canvas is empty'));
      }
    }, 'image/png');
  });
}
