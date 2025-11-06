#! /bin/sh

curl -fsSL https://api.github.com/meta -o github-meta.json

OUT=github-ipall-list.rsc
echo "# Auto‑generated MikroTik address list – GitHub IPs" > $OUT
echo "/ip firewall address-list" >> $OUT

# Extract and combine all relevant service IPs, sort, deduplicate
jq -r '
[
    .web,
    .api,
    .git,
    .hooks,
    .packages,
    .pages,
    .actions
] | add | unique[]
' github-meta.json | sort |
while read CIDR; do
echo "add address=${CIDR} list=github-list-all" >> $OUT
done