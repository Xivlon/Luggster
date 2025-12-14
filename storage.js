/**
 * R2 Storage utilities for handling photo evidence uploads
 */

/**
 * Generates a unique key for storing photos in R2
 * @param {string} shipmentId - The shipment UUID
 * @param {string} photoType - Type of photo ('pickup', 'delivery', 'signature')
 * @param {string} extension - File extension (e.g., 'jpg', 'png')
 * @returns {string} The R2 object key
 */
export function generatePhotoKey(shipmentId, photoType, extension = 'jpg') {
  const timestamp = Date.now();
  return `shipments/${shipmentId}/${photoType}_${timestamp}.${extension}`;
}

/**
 * Uploads a photo to R2 bucket
 * @param {Object} bucket - R2 bucket binding from env
 * @param {string} key - The object key
 * @param {ArrayBuffer|ReadableStream|string} data - The photo data
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with URL
 */
export async function uploadPhoto(bucket, key, data, options = {}) {
  const {
    contentType = 'image/jpeg',
    metadata = {},
  } = options;

  try {
    const result = await bucket.put(key, data, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        ...metadata,
        uploadedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      key,
      etag: result.etag,
      // Return a path that can be used to construct the full URL
      path: `/${key}`,
    };
  } catch (error) {
    console.error('R2 upload error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Retrieves a photo from R2 bucket
 * @param {Object} bucket - R2 bucket binding from env
 * @param {string} key - The object key
 * @returns {Promise<Object>} The R2 object or null
 */
export async function getPhoto(bucket, key) {
  try {
    const object = await bucket.get(key);
    
    if (!object) {
      return null;
    }

    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType || 'image/jpeg',
      etag: object.etag,
      metadata: object.customMetadata,
    };
  } catch (error) {
    console.error('R2 get error:', error);
    return null;
  }
}

/**
 * Deletes a photo from R2 bucket
 * @param {Object} bucket - R2 bucket binding from env
 * @param {string} key - The object key
 * @returns {Promise<boolean>} Success status
 */
export async function deletePhoto(bucket, key) {
  try {
    await bucket.delete(key);
    return true;
  } catch (error) {
    console.error('R2 delete error:', error);
    return false;
  }
}

/**
 * Lists all photos for a shipment
 * @param {Object} bucket - R2 bucket binding from env
 * @param {string} shipmentId - The shipment UUID
 * @returns {Promise<Array>} List of photo objects
 */
export async function listShipmentPhotos(bucket, shipmentId) {
  try {
    const prefix = `shipments/${shipmentId}/`;
    const listed = await bucket.list({ prefix });
    
    return listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      etag: obj.etag,
      uploaded: obj.uploaded,
    }));
  } catch (error) {
    console.error('R2 list error:', error);
    return [];
  }
}

/**
 * Processes a base64 encoded image for upload
 * @param {string} base64Data - Base64 encoded image data (with or without data URL prefix)
 * @returns {Object} Processed data ready for upload
 */
export function processBase64Image(base64Data) {
  let data = base64Data;
  let contentType = 'image/jpeg';
  let extension = 'jpg';

  // Handle data URL format: data:image/png;base64,xxxxx
  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      contentType = matches[1];
      data = matches[2];
      
      // Determine extension from content type
      const typeMap = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };
      extension = typeMap[contentType] || 'jpg';
    }
  }

  // Convert base64 to ArrayBuffer
  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return {
    data: bytes.buffer,
    contentType,
    extension,
  };
}

/**
 * Uploads a photo from base64 data
 * @param {Object} bucket - R2 bucket binding from env
 * @param {string} shipmentId - The shipment UUID
 * @param {string} photoType - Type of photo ('pickup', 'delivery', 'signature')
 * @param {string} base64Data - Base64 encoded image data
 * @param {Object} metadata - Optional metadata
 * @returns {Promise<Object>} Upload result
 */
export async function uploadBase64Photo(bucket, shipmentId, photoType, base64Data, metadata = {}) {
  const processed = processBase64Image(base64Data);
  const key = generatePhotoKey(shipmentId, photoType, processed.extension);
  
  return uploadPhoto(bucket, key, processed.data, {
    contentType: processed.contentType,
    metadata: {
      ...metadata,
      shipmentId,
      photoType,
    },
  });
}

/**
 * Generates a public URL for a photo (if R2 bucket has public access)
 * @param {string} bucketDomain - The R2 bucket public domain
 * @param {string} key - The object key
 * @returns {string} The public URL
 */
export function getPublicPhotoUrl(bucketDomain, key) {
  return `https://${bucketDomain}/${key}`;
}
