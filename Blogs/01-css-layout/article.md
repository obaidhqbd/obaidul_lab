# A Better Mental Model for CSS Layout

CSS layout becomes less mysterious when you ask one question first: **what is the layout system responsible for?**

## Start with normal flow

Normal flow is the browser's default arrangement. Block elements stack, inline content flows inside lines, and margins create space around boxes.

## Use Flexbox for one-dimensional relationships

Flexbox is excellent when you are primarily distributing items along a row or a column. Navigation bars, card rows and aligned controls are common examples.

```css
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```

## Use Grid for two-dimensional structure

Grid becomes useful when rows and columns matter together. A dashboard or a responsive card matrix is a natural fit.

The practical rule is simple: choose the layout model that matches the relationship you are actually trying to express. Humans invented three dozen ways to center a div because apparently one was not enough.
