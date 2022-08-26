//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

library PaymentHelper {
    function percentage(uint256 value, uint256 percent)
        internal
        pure
        returns (uint256)
    {
        return (value * percent) / 100000000000000000000; //Percent should be in 10e18
    }
}
