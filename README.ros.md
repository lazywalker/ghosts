# /system/script to renew address-list and dns

```rs
:log info "start download github-ip-list.rsc ..."
/tool fetch http-method=get url=https://raw.githubusercontent.com/lazywalker/ghosts/refs/heads/master/github-ip-list.rsc
:log info "github-ip-list downloaded."
/file {
    /ip firewall address-list remove [/ip firewall address-list find list=github-list]
    /ipv6 firewall address-list remove [/ipv6 firewall address-list find list=github-list]
    /import file=github-ip-list.rsc
    :log info "GitHub address list updated!"
    remove github-ip-list.rsc
}

```
You can also download and import the generated DNS static records file (`github-dns-list.rsc`) the same way:

```rs
:log info "start download github-dns-list.rsc ..."
/tool fetch http-method=get url=https://raw.githubusercontent.com/lazywalker/ghosts/refs/heads/master/github-dns-list.rsc
:log info "github-dns-list downloaded."
/file {
    /ip dns static remove [/ip dns static find comment=github]
    /import file=github-dns-list.rsc
    :log info "GitHub DNS list updated!"
    remove github-dns-list.rsc
}


```