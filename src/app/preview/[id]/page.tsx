import GiftLoader from "@/components/GiftLoader";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <GiftLoader id={(await params).id} preview />;
}
