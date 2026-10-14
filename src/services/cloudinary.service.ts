import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

const ensureConfigured = (): void => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Missing env CLOUDINARY");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
};

export const uploadImageBuffer = async (
  buffer: Buffer,
  opts: { folder: string; publicId?: string },
): Promise<{ url: string; publicId: string }> => {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder,
        public_id: opts.publicId,
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("UPLOAD_FAILED"));
          return;
        }

        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
        });
      },
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

export const uploadVideoBuffer = async (
  buffer: Buffer,
  opts: { folder: string; publicId?: string },
): Promise<{ url: string; publicId: string }> => {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder,
        public_id: opts.publicId,
        resource_type: "video",
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("UPLOAD_FAILED"));
          return;
        }

        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
        });
      },
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

export const uploadLargeVideoFile = async (
  filePath: string,
  opts: { folder: string; publicId?: string },
): Promise<{ url: string; publicId: string }> => {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(
      filePath,
      {
        folder: opts.folder,
        public_id: opts.publicId,
        resource_type: "video",
        chunk_size: 20 * 1024 * 1024, // 20MB chunks
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("UPLOAD_FAILED"));
          return;
        }

        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
        });
      },
    );
  });
};
