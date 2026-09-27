import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { OrderFlow } from "./GroceryDetailPage";
import type { StoreDetail } from "./types";

const store: StoreDetail = {
  id: "store-1",
  name: "zamzam kirana store",
  city: "birgunj",
  address: "power house chowk",
  description: null,
  storeType: "Supermarket",
  photos: [],
  openTime: "07:00",
  closeTime: "22:00",
  deliveryFee: 20,
  minOrder: 0,
  freeDeliveryAbove: null,
  deliveryEtaMinutes: 30,
  categories: [
    {
      id: "cat-kitchen",
      name: "Kitchen Items",
      products: [
        {
          id: "p-sugar", categoryId: "cat-kitchen", name: "Sugar", description: null,
          unit: "500 g", price: 90, mrp: null, stock: 20, inStock: true, photo: null, tags: [],
        },
        {
          id: "p-rice", categoryId: "cat-kitchen", name: "Rice", description: null,
          unit: "1 kg", price: 100, mrp: null, stock: 20, inStock: true, photo: null, tags: [],
        },
      ],
    },
    {
      id: "cat-cleaning",
      name: "Cleaning",
      products: [
        {
          id: "p-detergent", categoryId: "cat-cleaning", name: "Detergent", description: null,
          unit: "1 kg", price: 150, mrp: null, stock: 20, inStock: true, photo: null, tags: ["laundry"],
        },
      ],
    },
  ],
};

function renderFlow() {
  render(
    <MemoryRouter>
      <OrderFlow store={store} onDone={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("GroceryDetailPage product search", () => {
  it("filters products by name as you type", () => {
    renderFlow();
    fireEvent.change(screen.getByPlaceholderText(/search products/i), { target: { value: "sugar" } });
    expect(screen.getByText("Sugar")).toBeInTheDocument();
    expect(screen.queryByText("Rice")).not.toBeInTheDocument();
    expect(screen.queryByText("Detergent")).not.toBeInTheDocument();
  });

  it("hides a category entirely once none of its products match", () => {
    renderFlow();
    fireEvent.change(screen.getByPlaceholderText(/search products/i), { target: { value: "sugar" } });
    expect(screen.queryByText("Cleaning")).not.toBeInTheDocument();
  });

  it("also matches a product's unit", () => {
    renderFlow();
    fireEvent.change(screen.getByPlaceholderText(/search products/i), { target: { value: "1 kg" } });
    expect(screen.getByText("Rice")).toBeInTheDocument();
    expect(screen.getByText("Detergent")).toBeInTheDocument();
    expect(screen.queryByText("Sugar")).not.toBeInTheDocument();
  });

  it("also matches a product's tags", () => {
    renderFlow();
    fireEvent.change(screen.getByPlaceholderText(/search products/i), { target: { value: "laundry" } });
    expect(screen.getByText("Detergent")).toBeInTheDocument();
    expect(screen.queryByText("Sugar")).not.toBeInTheDocument();
    expect(screen.queryByText("Rice")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    renderFlow();
    fireEvent.change(screen.getByPlaceholderText(/search products/i), { target: { value: "xyz" } });
    expect(screen.queryByText("Sugar")).not.toBeInTheDocument();
    expect(screen.getByText(/no products match/i)).toBeInTheDocument();
    expect(screen.getByText(/xyz/)).toBeInTheDocument();
  });

  it("restores every product once the search is cleared", () => {
    renderFlow();
    const input = screen.getByPlaceholderText(/search products/i);
    fireEvent.change(input, { target: { value: "sugar" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Sugar")).toBeInTheDocument();
    expect(screen.getByText("Rice")).toBeInTheDocument();
    expect(screen.getByText("Detergent")).toBeInTheDocument();
  });
});
