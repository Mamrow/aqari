export const LISTING_TYPES = ['sale', 'rent'];

// Chalet/istiraha is a normal property type — people buy them outright (sale)
// or rent them, typically short-term/day-rental in practice (rent). It's
// selectable under both, same as apartment/villa.
export const PROPERTY_TYPES = ['apartment', 'villa', 'office', 'land', 'shop', 'chalet', 'semi_finished'];

export const CHALET_PROPERTY_TYPE = 'chalet';

// How many photos a listing needs before it can be submitted, per type.
//
// One number for everything was 5, which is right for a home and wrong for
// everything else: a plot of land is a plot of land, and demanding five
// angles of it produces four near-identical photos of dirt rather than a
// better listing. Three tiers, by how much there actually is to show:
//
//   5  somewhere people live or stay — rooms, kitchen, bathroom, outside.
//      A buyer won't take a home seriously on two photos, and a chalet is
//      rented on its photos more than anything else.
//   3  a single commercial space or an unfinished building — the inside,
//      the entrance, and the street or the shell it sits in.
//   1  bare land.
//
// MAX_PHOTOS (AddListingScreen) stays 15 for every type; this is only the
// floor.
export const MIN_PHOTOS_BY_PROPERTY_TYPE = {
  apartment: 5,
  villa: 5,
  chalet: 5,
  office: 3,
  shop: 3,
  semi_finished: 3,
  land: 1,
};

// Falls back to the strictest tier: a property type added here later without
// a number of its own should ask for more photos, not fewer, until someone
// decides otherwise.
export const DEFAULT_MIN_PHOTOS = 5;

export function minPhotosForPropertyType(propertyType) {
  return MIN_PHOTOS_BY_PROPERTY_TYPE[propertyType] ?? DEFAULT_MIN_PHOTOS;
}

export const AMENITIES = ['wifi', 'pool', 'generator'];

export const AUDIENCE_OPTIONS = ['families', 'youth', 'both'];

export const LISTING_TYPE_LABEL_KEYS = {
  sale: 'purposeSale',
  rent: 'purposeRent',
};

export const PROPERTY_TYPE_LABEL_KEYS = {
  apartment: 'propertyApartment',
  villa: 'propertyVilla',
  office: 'propertyOffice',
  land: 'propertyLand',
  shop: 'propertyShop',
  chalet: 'propertyChalet',
  semi_finished: 'propertySemiFinished',
};

export const AMENITY_LABEL_KEYS = {
  wifi: 'amenityWifi',
  pool: 'amenityPool',
  generator: 'amenityGenerator',
};

export const AUDIENCE_LABEL_KEYS = {
  families: 'audienceFamilies',
  youth: 'audienceYouth',
  both: 'audienceBoth',
};
