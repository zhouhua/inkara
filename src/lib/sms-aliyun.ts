/**
 * Aliyun Dysmsapi SendSms via RPC signature (HMAC-SHA1).
 * https://help.aliyun.com/document_detail/101414.html
 */

import { createHmac, randomBytes } from "node:crypto";

function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

export async function sendAliyunSms(opts: {
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
  phone: string;
  templateParam: Record<string, string>;
}): Promise<void> {
  const params: Record<string, string> = {
    AccessKeyId: opts.accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: opts.phone,
    RegionId: "cn-hangzhou",
    SignName: opts.signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: randomBytes(16).toString("hex"),
    SignatureVersion: "1.0",
    TemplateCode: opts.templateCode,
    TemplateParam: JSON.stringify(opts.templateParam),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25",
  };

  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k]!)}`)
    .join("&");
  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonical)}`;
  const signature = createHmac("sha1", `${opts.accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");
  const url = `https://dysmsapi.aliyuncs.com/?Signature=${percentEncode(signature)}&${canonical}`;
  const res = await fetch(url);
  const body = (await res.json()) as { Code?: string; Message?: string };
  if (body.Code !== "OK") {
    throw new Error(
      `Aliyun SMS: ${body.Code ?? res.status} ${body.Message ?? ""}`,
    );
  }
}
