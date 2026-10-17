"use client";

import { createContext, useContext } from "react";
import { buildBrand, type Brand } from "@/lib/brand-shared";

const BrandContext = createContext<Brand>(buildBrand({ name: "Our Restaurant" }));

export function BrandProvider({ brand, children }: { brand: Brand; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}
