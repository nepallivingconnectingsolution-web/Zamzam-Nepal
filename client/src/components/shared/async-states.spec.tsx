import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AsyncBoundary } from "./async-states";

describe("AsyncBoundary", () => {
  it("renders a skeleton while loading, not the children", () => {
    render(
      <AsyncBoundary state="loading" label="Orders">
        <div>real content</div>
      </AsyncBoundary>,
    );
    expect(screen.queryByText("real content")).not.toBeInTheDocument();
  });

  it("renders a skeleton for the idle state too (before the first fetch kicks off)", () => {
    render(
      <AsyncBoundary state="idle" label="Orders">
        <div>real content</div>
      </AsyncBoundary>,
    );
    expect(screen.queryByText("real content")).not.toBeInTheDocument();
  });

  it("renders the error state with a working retry button", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <AsyncBoundary state="error" label="Orders" onRetry={onRetry}>
        <div>real content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByText("Couldn't load this")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the default empty state using the provided label", () => {
    render(
      <AsyncBoundary state="empty" label="Orders">
        <div>real content</div>
      </AsyncBoundary>,
    );
    expect(screen.getByText(/orders will appear here/i)).toBeInTheDocument();
  });

  it("renders a custom empty node when provided instead of the default", () => {
    render(
      <AsyncBoundary state="empty" label="Orders" empty={<div>custom empty</div>}>
        <div>real content</div>
      </AsyncBoundary>,
    );
    expect(screen.getByText("custom empty")).toBeInTheDocument();
    expect(screen.queryByText(/orders will appear here/i)).not.toBeInTheDocument();
  });

  it("renders children exactly on the success state", () => {
    render(
      <AsyncBoundary state="success" label="Orders">
        <div>real content</div>
      </AsyncBoundary>,
    );
    expect(screen.getByText("real content")).toBeInTheDocument();
  });
});
