export function calculateDeliveryCost(
  cartItems,
  deliveryCostPerMealPerDay
) {
  let totalDeliveryCost = 0;

  for (const item of cartItems) {
    if (item.plan && item.menu) {
      const planDays = item.plan.durationDays;
      const numberOfSelectedMealTimes = item.selectedMealTimes ? item.selectedMealTimes.length : 0;
      const quantity = item.quantity;

      // Only add delivery cost if meal times are selected
      if (numberOfSelectedMealTimes > 0) {
        totalDeliveryCost += planDays * numberOfSelectedMealTimes * deliveryCostPerMealPerDay;
      }
    }
  }

  return totalDeliveryCost;
}

export function calculatePlatformCost(subtotal) {
  return subtotal * 0.1;
}

export function calculateGstCost(subtotal) {
  return subtotal * 0.05;
}

export function calculateGrandTotal({
  subtotal,
  deliveryCost,
  platformCost,
  gstCost,
  environment, // Add environment parameter for conditional logic
}) {
  return subtotal + deliveryCost + platformCost + gstCost;
}
