// Backend response supplied for the order modal courier quote integration.
export const courierQuotesResponse = {
  success: true,
  message: 'Parcel saved and courier quotes fetched.',
  data: {
    parcelDetails: { weight: 1.5, length: 20, breadth: 15, height: 10, updatedAt: '2026-10-30T14:22:21.382Z', updatedBy: '69ba6af81bcb9dc3043eb8d8' },
    deliveryServiceability: {
      isChecked: true, isServiceable: true, pincode: '700159', pickupPincode: '700006',
      codAvailable: false, estimatedDeliveryDays: null, checkedAt: '2026-10-30T14:22:22.166Z',
      courierOptions: [
        { courierId: '10', courierName: 'Delhivery Air', freightCharge: 175.72, estimatedDays: null, codAvailable: true },
        { courierId: '1', courierName: 'Blue Dart Air', freightCharge: 264.84000000000003, estimatedDays: null, codAvailable: true },
        { courierId: '32', courierName: 'Amazon Shipping Surface 2kg', freightCharge: 116.72, estimatedDays: null, codAvailable: true },
        { courierId: '44', courierName: 'Delhivery Surface 2 Kgs', freightCharge: 140.72, estimatedDays: null, codAvailable: true },
      ],
    },
  },
};
