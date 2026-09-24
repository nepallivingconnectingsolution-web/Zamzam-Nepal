import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhotoLightbox } from "./photo-lightbox";

const photos = ["a.jpg", "b.jpg", "c.jpg"];

describe("PhotoLightbox", () => {
  it("renders nothing when closed", () => {
    render(<PhotoLightbox photos={photos} index={0} open={false} alt="Hotel" onClose={vi.fn()} onIndexChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the photo at the given index and a 1-based counter", () => {
    render(<PhotoLightbox photos={photos} index={1} open alt="Hotel" onClose={vi.fn()} onIndexChange={vi.fn()} />);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByAltText("Hotel photo 2 of 3")).toHaveAttribute("src", "b.jpg");
  });

  it("hides prev/next arrows and dots for a single photo", () => {
    render(<PhotoLightbox photos={["a.jpg"]} index={0} open alt="Hotel" onClose={vi.fn()} onIndexChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /next photo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /previous photo/i })).not.toBeInTheDocument();
  });

  it("advances to the next photo on click", () => {
    const onIndexChange = vi.fn();
    render(<PhotoLightbox photos={photos} index={0} open alt="Hotel" onClose={vi.fn()} onIndexChange={onIndexChange} />);
    fireEvent.click(screen.getByRole("button", { name: /next photo/i }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("wraps from the first photo to the last when going previous", () => {
    const onIndexChange = vi.fn();
    render(<PhotoLightbox photos={photos} index={0} open alt="Hotel" onClose={vi.fn()} onIndexChange={onIndexChange} />);
    fireEvent.click(screen.getByRole("button", { name: /previous photo/i }));
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<PhotoLightbox photos={photos} index={0} open alt="Hotel" onClose={onClose} onIndexChange={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates with arrow keys", () => {
    const onIndexChange = vi.fn();
    render(<PhotoLightbox photos={photos} index={0} open alt="Hotel" onClose={vi.fn()} onIndexChange={onIndexChange} />);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("closes when the backdrop is clicked but not when the photo itself is clicked", () => {
    const onClose = vi.fn();
    render(<PhotoLightbox photos={photos} index={0} open alt="Hotel" onClose={onClose} onIndexChange={vi.fn()} />);
    fireEvent.click(screen.getByAltText("Hotel photo 1 of 3"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });
});
