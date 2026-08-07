// GENERATED from openapi.json — do not edit by hand.
//
// Per-route invocation contracts published inside the x402 402 challenge as
// `accepts[].outputSchema`. `input` tells an agent how to build the request
// (method, query/path params, JSON body fields); `output` is the JSON Schema of
// the 200 body it gets back once payment settles.
//
// Deriving these from `openapi.json` keeps the runtime challenge — which the
// x402scan discovery spec treats as authoritative — from ever contradicting the
// published spec. Regenerate whenever a paid route's parameters or response
// schema change.
//
// Keys match the paywall route map in `server.ts` exactly (`"<METHOD> <path>"`,
// with `:param` for path segments).

import type { RouteSchema } from "./payments.js";

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "POST /register": {
    "input": {
      "type": "http",
      "method": "POST",
      "bodyType": "json",
      "bodyFields": {
        "name": {
          "type": "string",
          "maxLength": 80,
          "x-required": true
        },
        "description": {
          "type": "string",
          "maxLength": 1000,
          "x-required": true
        },
        "skillMdUrl": {
          "type": "string",
          "format": "uri",
          "x-required": true
        },
        "homepage": {
          "type": "string",
          "format": "uri"
        },
        "manifestUrl": {
          "type": "string",
          "format": "uri"
        },
        "openapiUrl": {
          "type": "string",
          "format": "uri"
        },
        "categories": {
          "type": "array",
          "maxItems": 12,
          "items": {
            "type": "string"
          }
        },
        "contact": {
          "type": "string"
        },
        "ttlDays": {
          "type": "integer",
          "minimum": 1,
          "maximum": 3650,
          "default": 365
        },
        "resources": {
          "type": "array",
          "minItems": 1,
          "maxItems": 50,
          "items": {
            "type": "object",
            "required": [
              "resource",
              "price"
            ],
            "properties": {
              "resource": {
                "type": "string",
                "pattern": "^[A-Z]+ /",
                "examples": [
                  "GET /forecast"
                ]
              },
              "price": {
                "type": "string",
                "pattern": "^(free|\\$\\d+(\\.\\d+)?)$"
              },
              "description": {
                "type": "string",
                "maxLength": 400
              }
            }
          },
          "x-required": true
        },
        "rails": {
          "type": "array",
          "minItems": 2,
          "description": "MUST include at least one EVM rail and at least one Solana rail, or the request is rejected with 422 NOT_DUAL_RAIL.",
          "items": {
            "type": "object",
            "required": [
              "network",
              "payTo"
            ],
            "properties": {
              "rail": {
                "type": "string",
                "enum": [
                  "evm",
                  "solana"
                ]
              },
              "network": {
                "type": "string",
                "enum": [
                  "base",
                  "base-sepolia",
                  "solana",
                  "solana-devnet"
                ]
              },
              "asset": {
                "type": "string",
                "default": "USDC"
              },
              "payTo": {
                "type": "string",
                "description": "0x + 40 hex for EVM networks, base58 for Solana networks."
              },
              "facilitator": {
                "type": "string",
                "format": "uri",
                "description": "The facilitator that settles THIS rail \u2014 they are chain-specific."
              },
              "feePayer": {
                "type": "string",
                "description": "Solana only: the sponsor account that pays the network fee."
              }
            }
          },
          "x-required": true
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "listing",
        "signature",
        "updateKey"
      ],
      "properties": {
        "listing": {
          "type": "object",
          "required": [
            "type",
            "listingId",
            "name",
            "description",
            "skillMdUrl",
            "resources",
            "rails",
            "dualRail",
            "registeredAt",
            "expiresAt",
            "origin"
          ],
          "properties": {
            "type": {
              "type": "string",
              "const": "x402-skill-listing"
            },
            "listingId": {
              "type": "string",
              "format": "uuid"
            },
            "name": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "homepage": {
              "type": [
                "string",
                "null"
              ]
            },
            "skillMdUrl": {
              "type": "string",
              "format": "uri"
            },
            "manifestUrl": {
              "type": [
                "string",
                "null"
              ]
            },
            "openapiUrl": {
              "type": [
                "string",
                "null"
              ]
            },
            "categories": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "resources": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "resource",
                  "price"
                ],
                "properties": {
                  "resource": {
                    "type": "string",
                    "pattern": "^[A-Z]+ /",
                    "examples": [
                      "GET /forecast"
                    ]
                  },
                  "price": {
                    "type": "string",
                    "pattern": "^(free|\\$\\d+(\\.\\d+)?)$"
                  },
                  "description": {
                    "type": "string",
                    "maxLength": 400
                  }
                }
              }
            },
            "rails": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "network",
                  "payTo"
                ],
                "properties": {
                  "rail": {
                    "type": "string",
                    "enum": [
                      "evm",
                      "solana"
                    ]
                  },
                  "network": {
                    "type": "string",
                    "enum": [
                      "base",
                      "base-sepolia",
                      "solana",
                      "solana-devnet"
                    ]
                  },
                  "asset": {
                    "type": "string",
                    "default": "USDC"
                  },
                  "payTo": {
                    "type": "string",
                    "description": "0x + 40 hex for EVM networks, base58 for Solana networks."
                  },
                  "facilitator": {
                    "type": "string",
                    "format": "uri",
                    "description": "The facilitator that settles THIS rail \u2014 they are chain-specific."
                  },
                  "feePayer": {
                    "type": "string",
                    "description": "Solana only: the sponsor account that pays the network fee."
                  }
                }
              }
            },
            "dualRail": {
              "type": "boolean",
              "const": true,
              "description": "Always true \u2014 registration rejects anything else."
            },
            "contact": {
              "type": [
                "string",
                "null"
              ]
            },
            "registeredAt": {
              "type": "string",
              "format": "date-time"
            },
            "expiresAt": {
              "type": "string",
              "format": "date-time"
            },
            "origin": {
              "type": "string",
              "enum": [
                "registered",
                "seed"
              ],
              "description": "`seed` rows are the x402 Suite's own services, added on first boot so a fresh index is not empty."
            }
          }
        },
        "signature": {
          "type": "string"
        },
        "algorithm": {
          "type": "string"
        },
        "updateKey": {
          "type": "string",
          "description": "Returned once; stored only as a SHA-256 hash."
        },
        "updateKeyNote": {
          "type": "string"
        },
        "listingUrl": {
          "type": "string"
        },
        "indexUrl": {
          "type": "string"
        },
        "receipt": {
          "type": [
            "object",
            "null"
          ]
        }
      }
    }
  },
  "GET /search": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {
        "q": {
          "type": "string",
          "examples": [
            "domain"
          ],
          "description": "Free text over name, categories, description and route names. Omit to list everything."
        },
        "rail": {
          "type": "string",
          "enum": [
            "evm",
            "solana"
          ],
          "description": "Only listings accepting this rail."
        },
        "network": {
          "type": "string",
          "enum": [
            "base",
            "base-sepolia",
            "solana",
            "solana-devnet"
          ]
        },
        "category": {
          "type": "string"
        },
        "maxPrice": {
          "type": "number",
          "minimum": 0,
          "description": "Only listings whose cheapest paid route is at or below this USD amount."
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50,
          "default": 10
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "count",
        "results",
        "searchedAt"
      ],
      "properties": {
        "query": {
          "type": [
            "string",
            "null"
          ]
        },
        "filters": {
          "type": "object"
        },
        "count": {
          "type": "integer"
        },
        "results": {
          "type": "array",
          "items": {
            "allOf": [
              {
                "type": "object",
                "required": [
                  "type",
                  "listingId",
                  "name",
                  "description",
                  "skillMdUrl",
                  "resources",
                  "rails",
                  "dualRail",
                  "registeredAt",
                  "expiresAt",
                  "origin"
                ],
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "x402-skill-listing"
                  },
                  "listingId": {
                    "type": "string",
                    "format": "uuid"
                  },
                  "name": {
                    "type": "string"
                  },
                  "description": {
                    "type": "string"
                  },
                  "homepage": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "skillMdUrl": {
                    "type": "string",
                    "format": "uri"
                  },
                  "manifestUrl": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "openapiUrl": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "categories": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  },
                  "resources": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "resource",
                        "price"
                      ],
                      "properties": {
                        "resource": {
                          "type": "string",
                          "pattern": "^[A-Z]+ /",
                          "examples": [
                            "GET /forecast"
                          ]
                        },
                        "price": {
                          "type": "string",
                          "pattern": "^(free|\\$\\d+(\\.\\d+)?)$"
                        },
                        "description": {
                          "type": "string",
                          "maxLength": 400
                        }
                      }
                    }
                  },
                  "rails": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "network",
                        "payTo"
                      ],
                      "properties": {
                        "rail": {
                          "type": "string",
                          "enum": [
                            "evm",
                            "solana"
                          ]
                        },
                        "network": {
                          "type": "string",
                          "enum": [
                            "base",
                            "base-sepolia",
                            "solana",
                            "solana-devnet"
                          ]
                        },
                        "asset": {
                          "type": "string",
                          "default": "USDC"
                        },
                        "payTo": {
                          "type": "string",
                          "description": "0x + 40 hex for EVM networks, base58 for Solana networks."
                        },
                        "facilitator": {
                          "type": "string",
                          "format": "uri",
                          "description": "The facilitator that settles THIS rail \u2014 they are chain-specific."
                        },
                        "feePayer": {
                          "type": "string",
                          "description": "Solana only: the sponsor account that pays the network fee."
                        }
                      }
                    }
                  },
                  "dualRail": {
                    "type": "boolean",
                    "const": true,
                    "description": "Always true \u2014 registration rejects anything else."
                  },
                  "contact": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "registeredAt": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "expiresAt": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "origin": {
                    "type": "string",
                    "enum": [
                      "registered",
                      "seed"
                    ],
                    "description": "`seed` rows are the x402 Suite's own services, added on first boot so a fresh index is not empty."
                  }
                }
              },
              {
                "type": "object",
                "properties": {
                  "cheapestPaidRoute": {
                    "type": "number"
                  },
                  "score": {
                    "type": "number"
                  },
                  "matched": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Which fields matched, so relevance is explainable."
                  }
                }
              }
            ]
          }
        },
        "searchedAt": {
          "type": "string",
          "format": "date-time"
        },
        "receipt": {
          "type": [
            "object",
            "null"
          ]
        }
      }
    }
  },
};
