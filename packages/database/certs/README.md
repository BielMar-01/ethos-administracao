# CA pública do Supabase

`supabase-ca.crt` é um certificado público, não uma chave privada. Obtido em 22/10/2026 de:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Emissor: Supabase Root 2021 CA. Validade até 26/04/2031.

SHA-256 do certificado (DER): `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

Runtime: `rejectUnauthorized: true`, com CA explícita e verificação de hostname. Prisma Migrate: `sslmode=require`, `sslaccept=strict` e `sslcert` absoluto. Não desative a validação TLS para contornar falhas de certificado. Ao renovar a CA, confira a distribuição oficial e teste antes de substituir o arquivo.
