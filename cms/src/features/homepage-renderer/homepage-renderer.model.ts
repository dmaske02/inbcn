import type { HomepageLocale } from "@/features/homepage-builder/homepage-builder.types";
import type { HomepageRendererDiagnostic, HomepageRendererFailureCode } from "./homepage-renderer.types.ts";

export class HomepageRendererError extends Error {
  readonly code:HomepageRendererFailureCode; readonly blockId?:string; readonly blockType?:string;
  constructor(code:HomepageRendererFailureCode,message:string,context:Readonly<{blockId?:string;blockType?:string}>={}) { super(message); this.name="HomepageRendererError"; this.code=code; this.blockId=context.blockId; this.blockType=context.blockType; }
}
function sanitize(message:string) { return message.replace(/\b(secret|token|password|credential|api[_-]?key)\s*[=:]\s*\S+/giu,"$1=[redacted]").replace(/[\r\n\t]+/gu," ").replace(/\s+/gu," ").slice(0,240); }
export function diagnosticFromError(locale:HomepageLocale,error:unknown):HomepageRendererDiagnostic {
  if(error instanceof HomepageRendererError) return {locale,code:error.code,message:sanitize(error.message),...(error.blockId?{blockId:error.blockId}:{}),...(error.blockType?{blockType:error.blockType}:{})};
  return {locale,code:"UNEXPECTED",message:"Homepage Builder rendering failed."};
}
export function prepareAllRenderers<T,U>(sections:readonly T[],renderer:(section:T)=>U):readonly U[] { return sections.map(renderer); }
