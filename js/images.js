// Réduit les photos avant de les stocker (place limitée sur le téléphone).

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire cette image."));
    };
    img.src = url;
  });
}

function toBlob(img, maxSize, quality) {
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function preparePhoto(file) {
  const { img, url } = await loadImage(file);
  try {
    const photo = await toBlob(img, 1800, 0.85);
    const thumb = await toBlob(img, 420, 0.8);
    return { photo, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Garde les URL d'objets créées pour une vue, pour les libérer quand la vue change.
let live = [];
export function blobUrl(blob) {
  const url = URL.createObjectURL(blob);
  live.push(url);
  return url;
}
export function takeUrls() {
  const old = live;
  live = [];
  return old;
}
