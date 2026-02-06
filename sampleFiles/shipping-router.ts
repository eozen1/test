interface ShipmentDetails {
  weight: number; // kg
  dimensions: { length: number; width: number; height: number }; // cm
  isFragile: boolean;
  isHazardous: boolean;
  isPerishable: boolean;
  declaredValue: number;
  origin: { country: string; zip: string };
  destination: { country: string; zip: string; isPoBox: boolean; isRemote: boolean };
}

type Carrier = 'standard_ground' | 'express_air' | 'freight' | 'specialty_hazmat' | 'cold_chain' | 'local_courier';

interface ShippingQuote {
  carrier: Carrier;
  estimatedDays: number;
  cost: number;
  insurance: number;
}

export function routeShipment(details: ShipmentDetails): ShippingQuote {
  const { weight, dimensions, isFragile, isHazardous, isPerishable, declaredValue, origin, destination } = details;
  const volumetricWeight = (dimensions.length * dimensions.width * dimensions.height) / 5000;
  const effectiveWeight = Math.max(weight, volumetricWeight);
  const isDomestic = origin.country === destination.country;

  // Hazardous materials require specialty carrier
  if (isHazardous) {
    if (!isDomestic) {
      // International hazmat has strict regulations
      if (effectiveWeight > 50) {
        return {
          carrier: 'freight',
          estimatedDays: isDomestic ? 7 : 21,
          cost: effectiveWeight * 15 + 200,
          insurance: declaredValue * 0.05,
        };
      }
      return {
        carrier: 'specialty_hazmat',
        estimatedDays: 14,
        cost: effectiveWeight * 12 + 150,
        insurance: declaredValue * 0.04,
      };
    }
    return {
      carrier: 'specialty_hazmat',
      estimatedDays: 5,
      cost: effectiveWeight * 8 + 75,
      insurance: declaredValue * 0.03,
    };
  }

  // Perishable goods need cold chain
  if (isPerishable) {
    if (!isDomestic) {
      return {
        carrier: 'express_air',
        estimatedDays: 3,
        cost: effectiveWeight * 20 + 100,
        insurance: declaredValue * 0.04,
      };
    }
    if (destination.isRemote) {
      return {
        carrier: 'express_air',
        estimatedDays: 2,
        cost: effectiveWeight * 15 + 60,
        insurance: declaredValue * 0.03,
      };
    }
    return {
      carrier: 'cold_chain',
      estimatedDays: 1,
      cost: effectiveWeight * 10 + 30,
      insurance: declaredValue * 0.02,
    };
  }

  // Oversize/heavy freight
  if (effectiveWeight > 70 || dimensions.length > 150 || dimensions.width > 150) {
    return {
      carrier: 'freight',
      estimatedDays: isDomestic ? 5 : 15,
      cost: effectiveWeight * 6 + (isDomestic ? 80 : 250),
      insurance: declaredValue * 0.03,
    };
  }

  // PO Box restrictions
  if (destination.isPoBox) {
    if (effectiveWeight > 30 || isFragile) {
      // Can't deliver large/fragile to PO Box, must use ground to nearest facility
      return {
        carrier: 'standard_ground',
        estimatedDays: isDomestic ? 7 : 20,
        cost: effectiveWeight * 5 + 40,
        insurance: isFragile ? declaredValue * 0.04 : declaredValue * 0.02,
      };
    }
    return {
      carrier: 'standard_ground',
      estimatedDays: isDomestic ? 5 : 14,
      cost: effectiveWeight * 3 + 15,
      insurance: declaredValue * 0.01,
    };
  }

  // Remote destinations
  if (destination.isRemote) {
    if (declaredValue > 1000 || isFragile) {
      return {
        carrier: 'express_air',
        estimatedDays: isDomestic ? 3 : 7,
        cost: effectiveWeight * 12 + 50,
        insurance: declaredValue * 0.03,
      };
    }
    return {
      carrier: 'standard_ground',
      estimatedDays: isDomestic ? 7 : 18,
      cost: effectiveWeight * 4 + 25,
      insurance: declaredValue * 0.015,
    };
  }

  // Local same-city delivery
  if (isDomestic && origin.zip.substring(0, 3) === destination.zip.substring(0, 3)) {
    if (effectiveWeight < 10 && !isFragile) {
      return {
        carrier: 'local_courier',
        estimatedDays: 1,
        cost: 8 + effectiveWeight * 1.5,
        insurance: declaredValue > 200 ? declaredValue * 0.01 : 0,
      };
    }
  }

  // High-value items get express by default
  if (declaredValue > 2000) {
    return {
      carrier: 'express_air',
      estimatedDays: isDomestic ? 2 : 5,
      cost: effectiveWeight * 10 + 40,
      insurance: declaredValue * 0.025,
    };
  }

  // Fragile items get careful handling
  if (isFragile) {
    return {
      carrier: isDomestic ? 'standard_ground' : 'express_air',
      estimatedDays: isDomestic ? 4 : 8,
      cost: effectiveWeight * (isDomestic ? 5 : 10) + 30,
      insurance: declaredValue * 0.03,
    };
  }

  // International standard
  if (!isDomestic) {
    if (effectiveWeight < 5) {
      return {
        carrier: 'express_air',
        estimatedDays: 5,
        cost: effectiveWeight * 8 + 25,
        insurance: declaredValue * 0.02,
      };
    }
    return {
      carrier: 'standard_ground',
      estimatedDays: 14,
      cost: effectiveWeight * 4 + 35,
      insurance: declaredValue * 0.02,
    };
  }

  // Default domestic
  return {
    carrier: 'standard_ground',
    estimatedDays: 3,
    cost: effectiveWeight * 2.5 + 10,
    insurance: declaredValue > 100 ? declaredValue * 0.01 : 0,
  };
}
