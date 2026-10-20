CREATE TABLE "CacheRevision" (
    "owner" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "CacheRevision_pkey" PRIMARY KEY ("owner","tenant","key")
);
