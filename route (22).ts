import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getReceiptImageSignedUrl, readReceiptImage } from "@/lib/receipt-image";

export const runtime = "nodejs";

export async function GET(_: Request, { params }:{ params:Promise<{id:string}> }) {
  const user=await getCurrentUser(); if(!user)return new Response("Unauthorized",{status:401});
  const {id}=await params;
  const receipt=await prisma.receipt.findFirst({where:{id,userId:user.id,status:"DRAFT"},select:{imageStorageKey:true,imageMimeType:true}});
  if(!receipt?.imageStorageKey)return new Response("Not found",{status:404});
  try {
    const directUrl = await getReceiptImageSignedUrl(receipt.imageStorageKey, user.id);
    if (directUrl) return Response.redirect(directUrl, 302);
    const bytes=await readReceiptImage(receipt.imageStorageKey, user.id);
    return new Response(bytes,{headers:{"content-type":receipt.imageMimeType||"image/jpeg","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
  } catch { return new Response("Not found",{status:404}); }
}
