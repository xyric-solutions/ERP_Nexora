import type { Request } from "express";
import busboy from "busboy";

import { HttpError } from "../../../http/errors.js";

/** Buffers one uploaded file plus a bounded set of text fields from a multipart request. */
export async function parseSingleFileMultipart(
  req: Request,
  options: { maxFileBytes: number; allowedFields: ReadonlySet<string>; label: string },
): Promise<{ fields: Record<string, string>; file: { fileName: string; body: Buffer } }> {
  const maxRequestBytes = options.maxFileBytes + 64 * 1024;
  const contentLength = req.get("content-length");
  if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maxRequestBytes))
    throw new HttpError(413, "UPLOAD_TOO_LARGE", `The ${options.label} exceeds the upload size limit.`);
  const contentType = req.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;"))
    throw new HttpError(415, "MULTIPART_REQUIRED", `Use multipart/form-data to upload the ${options.label}.`);

  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        limits: {
          fileSize: options.maxFileBytes,
          files: 1,
          fields: options.allowedFields.size,
          parts: options.allowedFields.size + 1,
          fieldSize: 4_096,
        },
      });
    } catch {
      reject(new HttpError(400, "MULTIPART_INVALID", "The multipart request is invalid."));
      return;
    }
    const fields: Record<string, string> = {};
    const chunks: Buffer[] = [];
    let fileName = "";
    let fileSeen = false;
    let failure: Error | null = null;
    const fail = (error: Error) => {
      failure ??= error;
    };
    parser.on("field", (name, value, information) => {
      if (!options.allowedFields.has(name) || name in fields || information.nameTruncated || information.valueTruncated) {
        fail(new HttpError(400, "MULTIPART_INVALID", "The multipart fields are invalid."));
        return;
      }
      fields[name] = value;
    });
    parser.on("file", (name, file, information) => {
      if (name !== "file" || fileSeen) {
        fail(new HttpError(400, "MULTIPART_INVALID", `Exactly one ${options.label} is required.`));
        file.resume();
        return;
      }
      fileSeen = true;
      fileName = information.filename;
      file.on("data", (chunk: Buffer) => chunks.push(chunk));
      file.on("limit", () => fail(new HttpError(413, "UPLOAD_TOO_LARGE", `The ${options.label} exceeds the upload size limit.`)));
      file.on("error", () => fail(new HttpError(400, "MULTIPART_INVALID", "The uploaded file stream is invalid.")));
    });
    parser.on("filesLimit", () => fail(new HttpError(400, "MULTIPART_INVALID", `Exactly one ${options.label} is required.`)));
    parser.on("fieldsLimit", () => fail(new HttpError(400, "MULTIPART_INVALID", "Too many multipart fields were supplied.")));
    parser.on("partsLimit", () => fail(new HttpError(400, "MULTIPART_INVALID", "Too many multipart parts were supplied.")));
    parser.on("error", () => fail(new HttpError(400, "MULTIPART_INVALID", "The multipart request is invalid.")));
    parser.on("close", () => {
      if (failure) {
        reject(failure);
        return;
      }
      const body = Buffer.concat(chunks);
      if (!fileSeen || !fileName || body.length === 0) {
        reject(new HttpError(400, "UPLOAD_FILE_REQUIRED", `A non-empty ${options.label} is required.`));
        return;
      }
      resolve({ fields, file: { fileName, body } });
    });
    req.on("aborted", () => fail(new HttpError(400, "UPLOAD_ABORTED", "The upload was interrupted.")));
    req.pipe(parser);
  });
}
