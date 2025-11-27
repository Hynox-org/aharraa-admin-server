import React, { useMemo } from 'react';
import {
  calculateDeliveryCost,
  calculatePlatformCost,
  calculateGstCost,
  calculateGrandTotal,
} from './pricingCalculations';

// Dummy type definitions for illustration, assuming a JavaScript context
// In a real TypeScript project, these would come from a .d.ts file or similar.
/**
 * @typedef {object} MenuItem
 * @property {string} category
 */

/**
 * @typedef {object} Menu
 * @property {MenuItem[]} menuItems
 * @property {string} category // Added for consistency with pdfGenerator.js
 */

/**
 * @typedef {object} Plan
 * @property {number} durationDays
 */

/**
 * @typedef {object} CartItem
 * @property {number} itemTotalPrice
 * @property {Menu} menu
 * @property {Plan} plan
 */

/**
 * Custom hook to calculate pricing for the checkout page.
 * @param {CartItem[]} userCartItems - Array of items in the user's cart.
 */
export const useCheckoutPricing = (userCartItems) => {
  const totalPrice = useMemo(
    () => userCartItems.reduce((sum, item) => sum + item.itemTotalPrice, 0),
    [userCartItems]
  );

  // Based on the user's original snippet which used menuItems categories
  const deliveryCostPerMealPerDay = 33.33; // Renamed for consistency with backend
  const deliveryCost = useMemo(
    () =>
      calculateDeliveryCost(
        userCartItems, // Pass the entire items array
        deliveryCostPerMealPerDay
      ),
    [userCartItems, deliveryCostPerMealPerDay]
  );

  const platformCost = useMemo(
    () => calculatePlatformCost(totalPrice),
    [totalPrice]
  );

  const gstCost = useMemo(() => calculateGstCost(totalPrice), [totalPrice]);

  const grandTotal = useMemo(
    () =>
      calculateGrandTotal({
        subtotal: totalPrice,
        deliveryCost,
        platformCost,
        gstCost,
        environment: process.env.NEXT_PUBLIC_ENVIRONMENT, // Use NEXT_PUBLIC_ENVIRONMENT for frontend
      }),
    [totalPrice, deliveryCost, platformCost, gstCost]
  );

  return {
    totalPrice,
    deliveryCost,
    platformCost,
    gstCost,
    grandTotal,
    uniqueMealCategories,
    totalPlanDays,
  };
};

// Example usage (not part of the actual component, just for demonstration)
/*
function CheckoutPage() {
  const userCartItems = [
    // ... populate with actual cart items
    {
      itemTotalPrice: 100,
      menu: {
        menuItems: [{ category: "Breakfast" }],
        category: "Breakfast" // Assuming this might also be present
      },
      plan: { durationDays: 30 }
    },
    {
      itemTotalPrice: 150,
      menu: {
        menuItems: [{ category: "Lunch" }],
        category: "Lunch"
      },
      plan: { durationDays: 15 }
    },
  ];

  const { totalPrice, deliveryCost, platformCost, gstCost, grandTotal } =
    useCheckoutPricing(userCartItems);

  return (
    <div>
      <p>Subtotal: ₹{totalPrice.toFixed(2)}</p>
      <p>Delivery Cost: ₹{deliveryCost.toFixed(2)}</p>
      <p>Platform Cost: ₹{platformCost.toFixed(2)}</p>
      <p>GST Cost: ₹{gstCost.toFixed(2)}</p>
      <h3>Grand Total: ₹{grandTotal.toFixed(2)}</h3>
    </div>
  );
}
*/
