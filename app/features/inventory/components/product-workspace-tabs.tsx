"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
export function ProductWorkspaceTabs({
  configuration = false,
  onNavigate,
}: {
  configuration?: boolean;
  onNavigate: (module: string, page: string, ref?: string) => void;
}) {
  return (
    <Tabs
      value={configuration ? "configuration" : "products"}
      onValueChange={(value) =>
        onNavigate("inventory", value === "configuration" ? "product-configuration" : "products")
      }
    >
      <TabsList aria-label="Product workspace">
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value="configuration">Configuration</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
