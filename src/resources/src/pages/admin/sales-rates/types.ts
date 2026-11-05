export interface SalesRate {
  id: number;
  clientId: number;
  clientName: string;
  clientBin: string;
  itemId: number;
  itemName: string;
  itemHsCode: string;
  unitId: number;
  unitName: string;
  salesRate: number;
  vatRate: number;
  additionPercent: number;
  vatableValue: number;
  activationDate: string;
  status: "Active" | "Frozen";
}

export interface ClientOption {
  id: number;
  name: string;
  bin: string;
}

export interface ItemOption {
  id: number;
  name: string;
  hsCode: string;
}

export interface UnitOption {
  id: number;
  purchaseUnit: string;
  salesUnit: string;
  factor: number;
}
