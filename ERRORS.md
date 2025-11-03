## ERR_BAD_STR_LEN

Happens when a php string declares a length that is different to the actual
length of the decoded string.
This length check is done by the number of bytes in the string, so
`string.length` isn't accurate when one UTF8-code point is encoded as multiple
bytes.
