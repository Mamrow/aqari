export const LISTING_TYPES = ['sale', 'rent'];

// Chalet/istiraha is a normal property type — people buy them outright (sale)
// or rent them, typically short-term/day-rental in practice (rent). It's
// selectable under both, same as apartment/villa.
export const PROPERTY_TYPES = ['apartment', 'villa', 'office', 'land', 'shop', 'chalet', 'semi_finished'];

export const CHALET_PROPERTY_TYPE = 'chalet';

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
