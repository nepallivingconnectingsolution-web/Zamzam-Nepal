import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BedDouble } from "lucide-react";
import { ListingCard } from "./listing-card";

function renderCard(props: Partial<React.ComponentProps<typeof ListingCard>> = {}) {
  return render(
    <MemoryRouter>
      <ListingCard
        to="/app/hotels/h1"
        photo="hotel.jpg"
        fallbackIcon={<BedDouble data-testid="fallback-icon" />}
        fallbackClassName="from-vertical-hotel/15 to-vertical-hotel/0"
        title="Zamzam Hotel"
        location="Birgunj"
        meta={["Free WiFi", "Breakfast included"]}
        price={800}
        priceUnit="/night"
        emptyPriceLabel="No rooms listed yet"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("ListingCard", () => {
  it("links to the given destination", () => {
    renderCard();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/app/hotels/h1");
  });

  it("renders the photo, title, location, meta, and price", () => {
    renderCard();
    expect(screen.getByAltText("Zamzam Hotel")).toHaveAttribute("src", "hotel.jpg");
    expect(screen.getByText("Zamzam Hotel")).toBeInTheDocument();
    expect(screen.getByText("Birgunj")).toBeInTheDocument();
    expect(screen.getByText("Free WiFi · Breakfast included")).toBeInTheDocument();
    expect(screen.getByText("रू 800")).toBeInTheDocument();
    expect(screen.getByText("/night")).toBeInTheDocument();
  });

  it("shows a fallback icon instead of an image when there is no photo", () => {
    renderCard({ photo: null });
    expect(screen.queryByAltText("Zamzam Hotel")).not.toBeInTheDocument();
    expect(screen.getByTestId("fallback-icon")).toBeInTheDocument();
  });

  it("shows the rating when provided", () => {
    renderCard({ rating: { average: 4.567, count: 12 } });
    expect(screen.getByText("4.6")).toBeInTheDocument();
  });

  it("omits the rating badge when there is none", () => {
    renderCard({ rating: null });
    expect(screen.queryByText(/^\d\.\d$/)).not.toBeInTheDocument();
  });

  it("shows the empty-price label when price is null", () => {
    renderCard({ price: null });
    expect(screen.getByText("No rooms listed yet")).toBeInTheDocument();
    expect(screen.queryByText(/रू/)).not.toBeInTheDocument();
  });
});
