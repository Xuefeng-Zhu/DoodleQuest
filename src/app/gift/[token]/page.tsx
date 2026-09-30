import GiftLoader from "@/components/GiftLoader";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <GiftLoader id={(await params).token} />;
}
